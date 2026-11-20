import { useEffect, useRef, useState } from "react";
import { Account, calculateFee, StargateClient } from "@cosmjs/stargate";
import { Decimal } from "@cosmjs/math";
import { EncodeObject } from "@cosmjs/proto-signing";
import { useRouter } from "next/router";
import { useChains } from "../../../context/ChainsContext";
import { DbTransaction } from "../../../types";
import { MsgTypeUrls } from "../../../types/txMsg";
import {
  EXEC,
  VOTE_V1,
  execToJson,
  guidedActions,
  normalizeExec,
} from "../../../lib/authz/messages";
import { AuthzAccount, discoverGranters, loadAuthzAccount } from "../../../lib/authz/queries";
import { availablePermission } from "../../../lib/authz/grants";
import { preflightExec, validateResources } from "../../../lib/authz/preflight";
import { getMultisigAccount } from "../../../lib/multisigHelpers";
import { requestJson } from "../../../lib/request";
import { approvedTransaction } from "../../../lib/transactionIntegrity";
import { serializeSignDoc } from "@cosmjs/amino";
import TxMsgExecDetails from "../../dataViews/TransactionInfo/TxMsgExecDetails";

interface Action {
  id: string;
  typeUrl: string;
  amount: string;
  denom: string;
  recipient: string;
  validator: string;
  provider: string;
  destination: string;
  proposal: string;
  option: string;
  metadata: string;
  rewards: string[];
}
export default function AuthzExecForm({
  senderAddress,
  initialActionType,
  onBack,
}: {
  senderAddress: string;
  initialActionType: string;
  accountOnChain: Account;
  onBack: () => void;
}) {
  const {
    chain,
    validatorState: { validators },
  } = useChains();
  const router = useRouter();
  const [granter, setGranter] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(true);
  const [discoveryError, setDiscoveryError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<AuthzAccount>();
  const [actions, setActions] = useState<Action[]>([]);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ tx: DbTransaction; gasUsed: number; bytes: number }>();
  const requestId = useRef(0);
  const processing = useRef(false);
  useEffect(() => {
    let active = true;
    const invalidateRequests = () => {
      requestId.current += 1;
    };
    invalidateRequests();
    setDiscovering(true);
    setDiscoveryError("");
    setSuggestions([]);
    setGranter("");
    setState(undefined);
    setActions([]);
    setReview(undefined);
    setError("");
    discoverGranters(chain.nodeAddress, chain.chainId, senderAddress, initialActionType)
      .then((wallets) => {
        if (active) setSuggestions(wallets);
      })
      .catch((e) => {
        if (active) setDiscoveryError(e instanceof Error ? e.message : "Could not load wallets");
      })
      .finally(() => {
        if (active) setDiscovering(false);
      });
    return () => {
      active = false;
      invalidateRequests();
    };
  }, [chain.nodeAddress, chain.chainId, senderAddress, initialActionType, refresh]);
  const units = (denom: string) => {
    const asset = chain.assets.find((a) => a.base === denom);
    const display = asset?.denom_units.find((u) => u.denom === asset.display);
    return { label: asset?.symbol || denom, exponent: display?.exponent ?? 0 };
  };
  const display = (amount: string, denom: string) =>
    `${Decimal.fromAtomics(amount, units(denom).exponent).toString()} ${units(denom).label}`;
  const reset = () => {
    setReview(undefined);
    setError("");
  };
  const edit = (id: string, value: Partial<Action>) => {
    reset();
    setActions((rows) => rows.map((a) => (a.id === id ? { ...a, ...value } : a)));
  };
  const run = async (job: () => Promise<void>) => {
    if (processing.current) return;
    processing.current = true;
    setBusy(true);
    setError("");
    try {
      await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      processing.current = false;
      setBusy(false);
    }
  };
  const load = (selectedGranter: string) =>
    run(async () => {
      const id = ++requestId.current;
      setState(undefined);
      setActions([]);
      setReview(undefined);
      const data = await loadAuthzAccount(
        chain.nodeAddress,
        chain.chainId,
        chain.addressPrefix,
        selectedGranter,
        senderAddress,
      );
      if (id === requestId.current) {
        setState(data);
        if (initialActionType) setActions([newAction(initialActionType, data)]);
      }
    });
  const newAction = (typeUrl: string, account = state): Action => ({
    id: crypto.randomUUID(),
    typeUrl,
    amount: "",
    denom:
      typeUrl === MsgTypeUrls.Send
        ? account?.spendable[0]?.denom || chain.denom
        : account?.bondDenom || chain.denom,
    recipient: "",
    validator: "",
    provider: "",
    destination: "",
    proposal: "",
    option: "",
    metadata: "",
    rewards: [],
  });
  const assemble = (): EncodeObject => {
    if (!state || !actions.length) throw new Error("Load a granter and add an action");
    const msgs: EncodeObject[] = actions.flatMap<EncodeObject>((a) => {
      const actor = state.granter;
      if (a.typeUrl === MsgTypeUrls.WithdrawDelegatorReward) {
        if (!a.rewards.length) throw new Error("Select at least one reward validator");
        return a.rewards.map((validatorAddress) => ({
          typeUrl: a.typeUrl,
          value: { delegatorAddress: actor, validatorAddress },
        }));
      }
      if (a.typeUrl === MsgTypeUrls.Vote || a.typeUrl === VOTE_V1) {
        return [
          {
            typeUrl: a.typeUrl,
            value: {
              voter: actor,
              proposalId: a.proposal,
              option: Number(a.option),
              ...(a.typeUrl === VOTE_V1 ? { metadata: a.metadata } : {}),
            },
          },
        ];
      }
      if (a.typeUrl === MsgTypeUrls.DualClaimRewards) {
        return [{ typeUrl: a.typeUrl, value: { creator: actor, provider: a.provider.trim() } }];
      }
      const amount = {
        denom: a.denom,
        amount: Decimal.fromUserInput(a.amount, units(a.denom).exponent).atomics,
      };
      if (a.typeUrl === MsgTypeUrls.Send) {
        return [
          {
            typeUrl: a.typeUrl,
            value: { fromAddress: actor, toAddress: a.recipient.trim(), amount: [amount] },
          },
        ];
      }
      if (a.typeUrl === MsgTypeUrls.BeginRedelegate) {
        return [
          {
            typeUrl: a.typeUrl,
            value: {
              delegatorAddress: actor,
              validatorSrcAddress: a.validator,
              validatorDstAddress: a.destination,
              amount,
            },
          },
        ];
      }
      if (a.typeUrl === MsgTypeUrls.DualRedelegate) {
        return [
          {
            typeUrl: a.typeUrl,
            value: {
              creator: actor,
              fromProvider: a.provider,
              toProvider: a.destination.trim(),
              fromChainID: "*",
              toChainID: "*",
              amount,
            },
          },
        ];
      }
      if (a.typeUrl === MsgTypeUrls.Undelegate || a.typeUrl === MsgTypeUrls.Delegate) {
        return [
          {
            typeUrl: a.typeUrl,
            value: { delegatorAddress: actor, validatorAddress: a.validator, amount },
          },
        ];
      }
      if (a.typeUrl !== MsgTypeUrls.DualDelegate && a.typeUrl !== MsgTypeUrls.DualUnbond) {
        throw new Error("Unsupported guided action");
      }
      return [
        {
          typeUrl: a.typeUrl,
          value: {
            creator: actor,
            provider: a.provider.trim(),
            validator: a.validator,
            chainID: "*",
            amount,
          },
        },
      ];
    });
    const message = normalizeExec(
      { typeUrl: EXEC, value: { grantee: senderAddress, msgs } },
      senderAddress,
    );
    validateResources(state, message.value.msgs);
    return execToJson(message);
  };
  const prepare = () =>
    run(async () => {
      setReview(undefined);
      const message = assemble();
      let step = "Connect to the chain RPC";
      let client: StargateClient | undefined;
      try {
        client = await StargateClient.connect(chain.nodeAddress);
        step = "Load the multisig account and public key";
        const [pubkey, account] = await getMultisigAccount(
          senderAddress,
          chain.addressPrefix,
          client,
        );
        if (!account) throw new Error("Multisig account is unavailable");
        const tx: DbTransaction = {
          accountNumber: account.accountNumber,
          sequence: account.sequence,
          chainId: chain.chainId,
          msgs: [message],
          fee: { amount: [], gas: "0" },
          memo,
        };
        step = "Validate grants and simulate the transaction";
        const gasUsed = await preflightExec(chain.nodeAddress, chain.addressPrefix, tx, pubkey);
        tx.fee = calculateFee(Math.ceil(gasUsed * 1.4), chain.gasPrice);
        step = "Simulate with the estimated fee";
        await preflightExec(chain.nodeAddress, chain.addressPrefix, tx, pubkey);
        setReview({
          tx,
          gasUsed,
          bytes: serializeSignDoc(approvedTransaction(tx, senderAddress).signDoc).length,
        });
      } catch (e) {
        throw new Error(
          `${step} failed: ${e instanceof Error ? e.message : "Unknown error"}. RPC: ${
            chain.nodeAddress
          }`,
        );
      } finally {
        client?.disconnect();
      }
    });
  const save = () =>
    run(async () => {
      if (!review) throw new Error("Review the transaction first");
      const client = await StargateClient.connect(chain.nodeAddress);
      try {
        const [pubkey] = await getMultisigAccount(senderAddress, chain.addressPrefix, client);
        const used = await preflightExec(chain.nodeAddress, chain.addressPrefix, review.tx, pubkey);
        if (used > Number(review.tx.fee.gas)) {
          throw new Error("Gas estimate changed. Review and simulate again.");
        }
        const { transactionID } = await requestJson("/api/transaction", {
          body: { dataJSON: JSON.stringify(review.tx) },
        });
        await router.push(`/${chain.registryName}/${senderAddress}/transaction/${transactionID}`);
      } finally {
        client.disconnect();
      }
    });
  return (
    <section className="authz-form">
      <button type="button" disabled={busy} onClick={onBack}>
        Remove transaction
      </button>
      <h3>
        {guidedActions.find((a) => a.typeUrl === initialActionType)?.label || "Transaction"} — on
        behalf of another wallet
      </h3>
      <p>
        The multisig signs and pays fees. Actions affect the granter below using its existing
        permissions.
      </p>
      <p>
        <strong>Multisig / grantee:</strong> <span className="address">{senderAddress}</span>
      </p>
      <fieldset disabled={busy}>
        <label>
          Granter wallet
          <select
            aria-label="Granter wallet"
            disabled={discovering || !!discoveryError || !suggestions.length}
            value={granter}
            onChange={(e) => {
              const selected = e.target.value;
              ++requestId.current;
              setGranter(selected);
              setState(undefined);
              setActions([]);
              reset();
              if (selected && suggestions.includes(selected)) void load(selected);
            }}
          >
            <option value="">
              {discovering ? "Finding authorized wallets…" : "Choose a wallet"}
            </option>
            {suggestions.map((address) => (
              <option key={address} value={address}>
                {address}
              </option>
            ))}
          </select>
        </label>
        <p>
          Only wallets with an active grant for this transaction type are listed. Spending and
          validator restrictions are checked after selection.
        </p>
        {discovering && <p role="status">Finding wallets that authorized this multisig…</p>}
        {discoveryError && <p role="alert">Could not load authorized wallets: {discoveryError}</p>}
        {!discovering && !discoveryError && !suggestions.length && (
          <p>
            No wallets have granted this multisig permission for this transaction type. The wallet
            owner must grant permission first.
          </p>
        )}
        <div className="buttons">
          <button
            type="button"
            disabled={discovering}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Refresh wallets
          </button>
          {granter && !state && (
            <button type="button" onClick={() => load(granter)}>
              Retry loading wallet
            </button>
          )}
        </div>
        {state && (
          <>
            <p>
              Loaded at block {state.height}. Changing the granter clears its actions. Permissions
              are checked again before saving and signing.
            </p>
            <details>
              <summary>Permissions ({state.permissions.length})</summary>
              {!state.permissions.length && (
                <p>No grants to this multisig. The granter must grant permission first.</p>
              )}
              {state.permissions.map((p, i) => (
                <div className="permission" key={i}>
                  <strong>
                    {guidedActions.find((a) => a.typeUrl === p.typeUrl)?.label || p.typeUrl}
                  </strong>{" "}
                  ·{" "}
                  {p.kind === "unsupported"
                    ? "Unsupported authorization"
                    : p.kind === "generic"
                    ? "General permission for this action"
                    : "Restricted permission"}
                  <br />
                  {p.expires === undefined
                    ? "No expiry"
                    : `Expires ${new Date(p.expires).toLocaleString()}${
                        p.expires <= state.time ? " (expired)" : ""
                      }`}
                  {p.limits && (
                    <div>
                      Remaining allowance:{" "}
                      {p.limits.map((c) => display(c.amount, c.denom)).join(", ")}
                    </div>
                  )}
                  {!!p.recipients?.length && (
                    <div>Allowed recipients: {p.recipients.join(", ")}</div>
                  )}
                  {!!p.allow?.length && <div>Allowed validators: {p.allow.join(", ")}</div>}
                  {!!p.deny?.length && <div>Excluded validators: {p.deny.join(", ")}</div>}
                </div>
              ))}
            </details>
            {actions.map((a, index) => (
              <article key={a.id}>
                <h3>
                  {index + 1}. {guidedActions.find((t) => t.typeUrl === a.typeUrl)?.label}
                </h3>
                {!availablePermission(state.permissions, a.typeUrl, state.time) && (
                  <p role="alert">
                    This wallet has no matching, unexpired permission for this action. Choose
                    another wallet or ask its owner to grant permission.
                  </p>
                )}
                {a.typeUrl === MsgTypeUrls.Send && (
                  <>
                    <label>
                      Recipient
                      <input
                        aria-label={`Recipient ${index + 1}`}
                        value={a.recipient}
                        onChange={(e) => edit(a.id, { recipient: e.target.value })}
                      />
                    </label>
                    <label>
                      Token
                      <select
                        aria-label={`Token ${index + 1}`}
                        value={a.denom}
                        onChange={(e) => edit(a.id, { denom: e.target.value, amount: "" })}
                      >
                        {state.spendable.map((c) => (
                          <option key={c.denom} value={c.denom}>
                            {units(c.denom).label} — spendable {display(c.amount, c.denom)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!state.spendable.length && (
                      <p>No spendable tokens. Vesting restrictions still apply.</p>
                    )}
                  </>
                )}
                {(
                  [
                    MsgTypeUrls.Undelegate,
                    MsgTypeUrls.DualUnbond,
                    MsgTypeUrls.BeginRedelegate,
                  ] as string[]
                ).includes(a.typeUrl) && (
                  <>
                    <label>
                      Validator delegation
                      <select
                        aria-label={`Validator ${index + 1}`}
                        value={a.validator}
                        onChange={(e) => edit(a.id, { validator: e.target.value })}
                      >
                        <option value="">Choose a validator</option>
                        {state.delegations.map((d) => (
                          <option key={d.validator} value={d.validator}>
                            {d.validator} — {display(d.amount, state.bondDenom)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {a.typeUrl !== MsgTypeUrls.BeginRedelegate && (
                      <p>
                        Unbonding starts the chain’s waiting period; it does not transfer tokens
                        immediately. Vesting locks remain in effect.
                      </p>
                    )}
                    {a.typeUrl === MsgTypeUrls.Undelegate && (
                      <p>
                        On Lava this may also reduce provider allocations through the staking hooks.
                      </p>
                    )}
                  </>
                )}
                {(a.typeUrl === MsgTypeUrls.DualUnbond ||
                  a.typeUrl === MsgTypeUrls.DualRedelegate) && (
                  <label>
                    Provider allocation
                    <select
                      aria-label={`Provider ${index + 1}`}
                      value={a.provider}
                      onChange={(e) => edit(a.id, { provider: e.target.value })}
                    >
                      <option value="">Choose a provider</option>
                      {state.providers.map((p) => (
                        <option key={p.provider} value={p.provider}>
                          {p.provider} — {display(p.amount, state.bondDenom)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {(
                  [
                    MsgTypeUrls.Delegate,
                    MsgTypeUrls.DualDelegate,
                    MsgTypeUrls.BeginRedelegate,
                  ] as string[]
                ).includes(a.typeUrl) && (
                  <label>
                    {a.typeUrl === MsgTypeUrls.BeginRedelegate
                      ? "Destination validator"
                      : "Validator"}
                    <select
                      aria-label={`${
                        a.typeUrl === MsgTypeUrls.BeginRedelegate
                          ? "Destination validator"
                          : "Validator"
                      } ${index + 1}`}
                      value={
                        a.typeUrl === MsgTypeUrls.BeginRedelegate ? a.destination : a.validator
                      }
                      onChange={(e) =>
                        edit(
                          a.id,
                          a.typeUrl === MsgTypeUrls.BeginRedelegate
                            ? { destination: e.target.value }
                            : { validator: e.target.value },
                        )
                      }
                    >
                      <option value="">Choose a validator</option>
                      {validators
                        .filter((v) => {
                          const permission = availablePermission(
                            state.permissions,
                            a.typeUrl,
                            state.time,
                          );
                          return (
                            (a.typeUrl !== MsgTypeUrls.BeginRedelegate ||
                              v.operatorAddress !== a.validator) &&
                            (!permission?.allow?.length ||
                              permission.allow.includes(v.operatorAddress)) &&
                            !permission?.deny?.includes(v.operatorAddress)
                          );
                        })
                        .map((v) => (
                          <option key={v.operatorAddress} value={v.operatorAddress}>
                            {v.description.moniker} — {v.operatorAddress}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {(a.typeUrl === MsgTypeUrls.Delegate || a.typeUrl === MsgTypeUrls.DualDelegate) && (
                  <p>
                    Bank balance:{" "}
                    {display(
                      state.stakingBalance?.find((c) => c.denom === state.bondDenom)?.amount || "0",
                      state.bondDenom,
                    )}
                    . Vesting tokens may be staked; simulation checks the account’s restrictions.
                    Delegation does not remove vesting locks.
                  </p>
                )}
                {(a.typeUrl === MsgTypeUrls.DualDelegate ||
                  a.typeUrl === MsgTypeUrls.DualRedelegate) && (
                  <label>
                    {a.typeUrl === MsgTypeUrls.DualRedelegate
                      ? "Destination provider address"
                      : "Provider address"}
                    <input
                      aria-label={`${
                        a.typeUrl === MsgTypeUrls.DualRedelegate
                          ? "Destination provider"
                          : "Provider"
                      } ${index + 1}`}
                      value={a.typeUrl === MsgTypeUrls.DualRedelegate ? a.destination : a.provider}
                      onChange={(e) =>
                        edit(
                          a.id,
                          a.typeUrl === MsgTypeUrls.DualRedelegate
                            ? { destination: e.target.value }
                            : { provider: e.target.value },
                        )
                      }
                    />
                  </label>
                )}
                {a.typeUrl === MsgTypeUrls.BeginRedelegate && (
                  <p>
                    Moves existing stake to another validator. Redelegation cooldowns and chain
                    limits are checked by simulation.
                  </p>
                )}
                {a.typeUrl === MsgTypeUrls.DualRedelegate && (
                  <p>Moves an existing provider allocation without adding new validator stake.</p>
                )}
                {a.typeUrl === MsgTypeUrls.DualClaimRewards && (
                  <>
                    <label>
                      Provider address (optional)
                      <input
                        aria-label={`Reward provider ${index + 1}`}
                        value={a.provider}
                        onChange={(e) => edit(a.id, { provider: e.target.value })}
                      />
                    </label>
                    <p>
                      Leave blank to claim rewards from all providers, including previous
                      allocations. Rewards are paid to the granter; the amount is determined at
                      execution.
                    </p>
                  </>
                )}
                {[
                  MsgTypeUrls.Send,
                  MsgTypeUrls.Undelegate,
                  MsgTypeUrls.DualUnbond,
                  MsgTypeUrls.Delegate,
                  MsgTypeUrls.BeginRedelegate,
                  MsgTypeUrls.DualDelegate,
                  MsgTypeUrls.DualRedelegate,
                ].includes(a.typeUrl as typeof MsgTypeUrls.Send) && (
                  <label>
                    Amount ({units(a.denom).label})
                    <input
                      aria-label={`Amount ${index + 1}`}
                      inputMode="decimal"
                      value={a.amount}
                      onChange={(e) => edit(a.id, { amount: e.target.value })}
                    />
                    {units(a.denom).exponent === 0 && (
                      <small>Enter integer base units for {a.denom}.</small>
                    )}
                  </label>
                )}
                {(a.typeUrl === MsgTypeUrls.Vote || a.typeUrl === VOTE_V1) && (
                  <>
                    <label>
                      Proposal
                      <select
                        aria-label={`Proposal ${index + 1}`}
                        value={a.proposal}
                        onChange={(e) => edit(a.id, { proposal: e.target.value })}
                      >
                        <option value="">Choose a proposal in voting</option>
                        {state.proposals.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.id}: {p.title} (ends {p.votingEnd})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Vote
                      <select
                        aria-label={`Vote ${index + 1}`}
                        value={a.option}
                        onChange={(e) => edit(a.id, { option: e.target.value })}
                      >
                        <option value="">Choose your vote</option>
                        <option value="1">Yes</option>
                        <option value="2">Abstain</option>
                        <option value="3">No</option>
                        <option value="4">No with veto</option>
                      </select>
                    </label>
                    <p>This may replace the granter’s existing vote on this proposal.</p>
                    {a.typeUrl === VOTE_V1 && (
                      <label>
                        Vote metadata (optional)
                        <input
                          value={a.metadata}
                          maxLength={10000}
                          onChange={(e) => edit(a.id, { metadata: e.target.value })}
                        />
                      </label>
                    )}
                  </>
                )}
                {a.typeUrl === MsgTypeUrls.WithdrawDelegatorReward && (
                  <>
                    <p>
                      Rewards go to <span className="address">{state.withdrawAddress}</span>.
                      Amounts can change before execution.
                    </p>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={
                          !!state.rewards.length && a.rewards.length === state.rewards.length
                        }
                        onChange={(e) =>
                          edit(a.id, {
                            rewards: e.target.checked ? state.rewards.map((r) => r.validator) : [],
                          })
                        }
                      />
                      Select all reward validators
                    </label>
                    {state.rewards.map((r) => (
                      <label className="check" key={r.validator}>
                        <input
                          type="checkbox"
                          checked={a.rewards.includes(r.validator)}
                          onChange={(e) =>
                            edit(a.id, {
                              rewards: e.target.checked
                                ? [...a.rewards, r.validator]
                                : a.rewards.filter((v) => v !== r.validator),
                            })
                          }
                        />
                        {r.validator}
                      </label>
                    ))}
                    {!state.rewards.length && <p>No delegation rewards found.</p>}
                  </>
                )}
              </article>
            ))}
            <label>
              Memo
              <input
                aria-label="Memo"
                value={memo}
                maxLength={256}
                onChange={(e) => {
                  setMemo(e.target.value);
                  reset();
                }}
              />
            </label>
            <button
              className="primary-action"
              type="button"
              disabled={
                !actions.length ||
                actions.some((a) => !availablePermission(state.permissions, a.typeUrl, state.time))
              }
              onClick={prepare}
            >
              Review and simulate
            </button>
          </>
        )}
        {review && (
          <section className="review">
            <h3>Review unsigned transaction</h3>
            <TxMsgExecDetails msgValue={review.tx.msgs[0].value} />
            <p>
              Gas used in simulation: {review.gasUsed.toLocaleString()}. Gas limit with 40% margin:{" "}
              {review.tx.fee.gas}.
            </p>
            <p>
              Multisig fee: {review.tx.fee.amount.map((c) => display(c.amount, c.denom)).join(", ")}
              . Sequence: {review.tx.sequence}.
            </p>
            <p>
              Signing document: {review.bytes.toLocaleString()} bytes. Ledger acceptance depends on
              device and Cosmos app version; this estimate does not guarantee hardware
              compatibility.
            </p>
            <button className="primary-action" type="button" onClick={save}>
              Create unsigned transaction
            </button>
          </section>
        )}
      </fieldset>
      {busy && <p role="status">Checking chain state…</p>}
      {error && <p role="alert">{error}</p>}
      <style jsx>{`
        .authz-form {
          max-width: 100%;
          width: 100%;
        }
        fieldset {
          border: 0;
          padding: 0;
          min-width: 0;
        }
        label {
          display: block;
          margin: 16px 0;
        }
        input:not([type="checkbox"]),
        select {
          display: block;
          width: 100%;
          padding: 10px;
          margin-top: 7px;
          color: inherit;
          background: #722d6f;
          border: 2px solid rgba(255, 255, 255, 0.5);
          border-radius: 9px;
        }
        option {
          background: #722d6f;
        }
        button {
          padding: 9px 14px;
          border: none;
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.15);
          font-style: italic;
          color: white;
          cursor: pointer;
        }
        .primary-action {
          display: block;
          width: 100%;
          min-height: 56px;
          margin-top: 24px;
          padding: 16px 24px;
          font-size: 1.125rem;
          font-weight: 700;
          font-style: normal;
          background: #a73c9e;
          border: 2px solid rgba(255, 255, 255, 0.6);
        }
        .primary-action:focus-visible {
          outline: 3px solid white;
          outline-offset: 3px;
        }
        button:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 12px 0;
        }
        article,
        .review {
          padding: 18px;
          margin: 20px 0;
          border: none;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .permission {
          padding: 10px 0;
          overflow-wrap: anywhere;
          border-bottom: 1px solid #78608b;
        }
        .address {
          overflow-wrap: anywhere;
        }
        .check {
          overflow-wrap: anywhere;
        }
        .check input {
          margin-right: 8px;
        }
        [role="alert"] {
          padding: 12px;
          color: #ffb4b4;
          border: 1px solid #ca7474;
          overflow-wrap: anywhere;
        }
        p {
          line-height: 1.5;
        }
        small {
          display: block;
        }
      `}</style>
    </section>
  );
}
