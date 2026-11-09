import { EncodeObject } from "@cosmjs/proto-signing";
import { useEffect, useState } from "react";
import { MsgGetter } from "..";
import { useChains } from "../../../../context/ChainsContext";
import { baseCoinToDisplayCoin, displayCoinToBaseCoin } from "../../../../lib/coinHelpers";
import {
  entryKey,
  getUnbondingSnapshot,
  UnbondingSnapshot,
  validateCancellation,
} from "../../../../lib/cancelUnbonding";
import { MsgCodecs, MsgTypeUrls } from "../../../../types/txMsg";
import StackableContainer from "../../../layout/StackableContainer";

interface Props {
  delegatorAddress: string;
  setMsgGetter: (getter: MsgGetter) => void;
  deleteMsg: () => void;
  msg: EncodeObject["value"];
}
export default function MsgCancelUnbondingDelegationForm({
  delegatorAddress,
  setMsgGetter,
  deleteMsg,
  msg: imported,
}: Props) {
  const { chain } = useChains();
  const [snapshot, setSnapshot] = useState<UnbondingSnapshot>();
  const [selected, setSelected] = useState(
    imported ? `${imported.validatorAddress}/${imported.creationHeight}` : "",
  );
  const [amount, setAmount] = useState(() => {
    try {
      return imported?.amount ? baseCoinToDisplayCoin(imported.amount, chain.assets).amount : "";
    } catch {
      return "";
    }
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSnapshot(undefined);
    setError("");
    getUnbondingSnapshot(chain.nodeAddress, delegatorAddress)
      .then((result) => {
        if (active) setSnapshot(result);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load unbonding entries");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [chain.nodeAddress, delegatorAddress, refresh]);

  useEffect(() => {
    const entry = snapshot?.entries.find((item) => entryKey(item) === selected);
    let problem = "";
    let coin = { denom: snapshot?.denom || "", amount: "0" };
    try {
      coin = displayCoinToBaseCoin({ denom: chain.displayDenom, amount }, chain.assets);
    } catch (reason) {
      problem = reason instanceof Error ? reason.message : "Invalid amount";
    }
    const value = MsgCodecs[MsgTypeUrls.CancelUnbondingDelegation].fromPartial({
      delegatorAddress,
      validatorAddress: entry?.validatorAddress || "",
      creationHeight: BigInt(entry?.creationHeight || "0"),
      amount: coin,
    });
    setMsgGetter({
      msg: { typeUrl: MsgTypeUrls.CancelUnbondingDelegation, value },
      isMsgValid: () => {
        try {
          if (loading || !snapshot) throw new Error("Load unbonding entries before continuing");
          if (!entry) throw new Error("Select an available unbonding entry");
          if (problem) throw new Error(problem);
          if (imported?.delegatorAddress && imported.delegatorAddress !== delegatorAddress) {
            throw new Error("Imported delegator does not match the multisig address");
          }
          if (imported?.amount && imported.amount.denom !== snapshot.denom) {
            throw new Error("Imported amount must use the staking denomination");
          }
          validateCancellation(snapshot, value, Math.max(snapshot.blockTime, Date.now()));
          setError("");
          return true;
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Invalid cancellation");
          return false;
        }
      },
    });
  }, [
    snapshot,
    selected,
    amount,
    loading,
    chain.assets,
    chain.displayDenom,
    delegatorAddress,
    imported,
    setMsgGetter,
  ]);

  const selectedEntry = snapshot?.entries.find((entry) => entryKey(entry) === selected);

  return (
    <StackableContainer lessPadding lessMargin>
      <button
        type="button"
        onClick={deleteMsg}
        aria-label="Remove cancellation"
        className="float-right"
      >
        ✕
      </button>
      <h2>Cancel unbonding</h2>
      <p>
        This returns the selected amount to delegation with the same validator. Other unbonding
        entries are unchanged.
      </p>
      <label className="mt-4 block">
        Unbonding entry
        <select
          className="mt-2 block w-full min-w-0 max-w-full rounded bg-fuchsia-950 p-3 text-sm"
          value={selected}
          disabled={loading || !snapshot}
          onChange={(event) => {
            const entry = snapshot?.entries.find((item) => entryKey(item) === event.target.value);
            setSelected(event.target.value);
            setError("");
            if (entry && snapshot) {
              setAmount(
                baseCoinToDisplayCoin(
                  { denom: snapshot.denom, amount: entry.balance },
                  chain.assets,
                ).amount,
              );
            }
          }}
        >
          <option value="">
            {loading ? "Loading unbonding entries…" : "Select an unbonding entry"}
          </option>
          {snapshot?.entries.map((entry) => {
            const reason =
              entry.unavailableReason ||
              (entry.completionTime <= Math.max(snapshot.blockTime, Date.now()) ? "Completed" : "");
            const display = baseCoinToDisplayCoin(
              { denom: snapshot.denom, amount: entry.balance },
              chain.assets,
            );
            return (
              <option key={entryKey(entry)} value={entryKey(entry)} disabled={!!reason}>
                {entry.validatorName} — {display.amount} {display.denom} — completes{" "}
                {new Date(entry.completionTime).toLocaleString()} — height {entry.creationHeight}
                {reason ? ` — ${reason}` : ""}
              </option>
            );
          })}
        </select>
      </label>
      {selectedEntry && snapshot && (
        <dl className="mt-3 space-y-2 rounded bg-white/5 p-3 text-sm">
          <div>
            <dt>Validator</dt>
            <dd className="break-all">
              {selectedEntry.validatorName} — {selectedEntry.validatorAddress}
            </dd>
          </div>
          <div>
            <dt>Creation height</dt>
            <dd>{selectedEntry.creationHeight}</dd>
          </div>
          <div>
            <dt>Remaining balance</dt>
            <dd>
              {
                baseCoinToDisplayCoin(
                  { denom: snapshot.denom, amount: selectedEntry.balance },
                  chain.assets,
                ).amount
              }{" "}
              {chain.displayDenom}
            </dd>
          </div>
          <div>
            <dt>Completes (local time)</dt>
            <dd>{new Date(selectedEntry.completionTime).toLocaleString()}</dd>
          </div>
        </dl>
      )}
      {!loading && snapshot && !snapshot.entries.length && (
        <p>No pending unbonding entries for this multisig.</p>
      )}
      <button
        type="button"
        disabled={loading}
        onClick={() => setRefresh((value) => value + 1)}
        className="my-3 underline"
      >
        Refresh entries
      </button>
      <label className="block">
        Amount ({chain.displayDenom})
        <input
          className="my-2 block w-full rounded bg-fuchsia-950 p-3"
          inputMode="decimal"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setError("");
          }}
        />
      </label>
      <p>Defaults to the full selected balance. Enter a smaller amount for partial cancellation.</p>
      {error && (
        <p role="alert" className="mt-3 text-red-300">
          {error}
        </p>
      )}
    </StackableContainer>
  );
}
