import { EncodeObject } from "@cosmjs/proto-signing";
import { useEffect, useState } from "react";
import { MsgGetter } from "..";
import { useChains } from "../../../../context/ChainsContext";
import { baseCoinToDisplayCoin, displayCoinToBaseCoin } from "../../../../lib/coinHelpers";
import {
  entryKey,
  getUnbondingSnapshot,
  UnbondingEntry,
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
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    if (!imported) return {};
    try {
      return {
        [`${imported.validatorAddress}/${imported.creationHeight}`]: baseCoinToDisplayCoin(
          imported.amount,
          chain.assets,
        ).amount,
      };
    } catch {
      return { [`${imported.validatorAddress}/${imported.creationHeight}`]: "" };
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
    let problem = "";
    const messages = Object.entries(selected).map(([key, amount]) => {
      const [validatorAddress, height] = key.split("/");
      let coin = { denom: snapshot?.denom || "", amount: "0" };
      let creationHeight = BigInt(0);
      try {
        coin = displayCoinToBaseCoin({ denom: chain.displayDenom, amount }, chain.assets);
        creationHeight = BigInt(height);
      } catch (reason) {
        problem = reason instanceof Error ? reason.message : "Invalid cancellation";
      }
      return {
        typeUrl: MsgTypeUrls.CancelUnbondingDelegation,
        value: MsgCodecs[MsgTypeUrls.CancelUnbondingDelegation].fromPartial({
          delegatorAddress,
          validatorAddress,
          creationHeight,
          amount: coin,
        }),
      };
    });
    setMsgGetter({
      msg: messages[0] ?? { typeUrl: MsgTypeUrls.CancelUnbondingDelegation, value: {} },
      msgs: messages,
      isMsgValid: () => {
        try {
          if (loading || !snapshot) throw new Error("Load unbonding entries before continuing");
          if (!messages.length) throw new Error("Select at least one unbonding entry");
          if (problem) throw new Error(problem);
          if (imported?.delegatorAddress && imported.delegatorAddress !== delegatorAddress) {
            throw new Error("Imported delegator does not match the multisig address");
          }
          if (imported?.amount && imported.amount.denom !== snapshot.denom) {
            throw new Error("Imported amount must use the staking denomination");
          }
          messages.forEach(({ value }) =>
            validateCancellation(snapshot, value, Math.max(snapshot.blockTime, Date.now())),
          );
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
    loading,
    chain.assets,
    chain.displayDenom,
    delegatorAddress,
    imported,
    setMsgGetter,
  ]);

  const reasonFor = (entry: UnbondingEntry) =>
    entry.unavailableReason ||
    (entry.completionTime <= Math.max(snapshot?.blockTime ?? 0, Date.now()) ? "Completed" : "");
  const available = snapshot?.entries.filter((entry) => !reasonFor(entry)) ?? [];
  const groups = new Map<string, UnbondingEntry[]>();
  snapshot?.entries.forEach((entry) =>
    groups.set(entry.validatorAddress, [...(groups.get(entry.validatorAddress) ?? []), entry]),
  );
  const displayAmount = (amount: string) =>
    baseCoinToDisplayCoin({ denom: snapshot!.denom, amount }, chain.assets).amount;
  const toggle = (entries: UnbondingEntry[], checked: boolean) => {
    setSelected((previous) => {
      const next = { ...previous };
      entries.forEach((entry) => {
        const key = entryKey(entry);
        if (checked) next[key] = previous[key] ?? displayAmount(entry.balance);
        else delete next[key];
      });
      return next;
    });
    setError("");
  };
  let total: string | undefined;
  try {
    const atomics = Object.values(selected).reduce(
      (sum, amount) =>
        sum +
        BigInt(displayCoinToBaseCoin({ denom: chain.displayDenom, amount }, chain.assets).amount),
      BigInt(0),
    );
    total = snapshot ? displayAmount(atomics.toString()) : "0";
  } catch {
    total = undefined;
  }
  const count = Object.keys(selected).length;
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
      <h2>Cancel unbondings</h2>
      <p>
        Select the entries to return to staking. Each selected entry becomes one message in a single
        multisig transaction.
      </p>
      <div className="my-4 flex flex-wrap items-center justify-between gap-3 rounded bg-white/5 p-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="Select all pending entries"
            disabled={loading || !available.length}
            checked={!!available.length && available.every((entry) => entryKey(entry) in selected)}
            onChange={(event) => toggle(available, event.target.checked)}
          />
          Select all pending entries ({available.length})
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
          className="underline"
        >
          Refresh entries
        </button>
      </div>
      {!!count && (
        <button
          type="button"
          className="mb-3 text-sm underline"
          onClick={() => {
            setSelected({});
            setError("");
          }}
        >
          Clear selection
        </button>
      )}
      {loading && <p>Loading unbonding entries…</p>}
      {!loading && snapshot && !snapshot.entries.length && (
        <p>No pending unbonding entries for this multisig.</p>
      )}
      <div className="max-h-[440px] space-y-4 overflow-y-auto pr-1">
        {Array.from(groups, ([address, entries]) => {
          const eligible = entries.filter((entry) => !reasonFor(entry));
          return (
            <section key={address} className="border-white/15 rounded-lg border">
              <div className="sticky top-0 z-10 rounded-t-lg bg-fuchsia-950 p-3">
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    aria-label={`Select all for ${entries[0].validatorName}`}
                    disabled={!eligible.length || loading}
                    checked={
                      !!eligible.length && eligible.every((entry) => entryKey(entry) in selected)
                    }
                    onChange={(event) => toggle(eligible, event.target.checked)}
                  />
                  {entries[0].validatorName}{" "}
                  <span className="text-xs font-normal">{entries.length} entries</span>
                </label>
                <div className="mt-1 break-all text-xs opacity-70">{address}</div>
              </div>
              {entries.map((entry) => {
                const key = entryKey(entry),
                  checked = key in selected,
                  reason = reasonFor(entry);
                return (
                  <div
                    key={key}
                    className={`border-t border-white/10 p-3 ${checked ? "bg-white/10" : ""}`}
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        className="mt-1"
                        type="checkbox"
                        aria-label={`Select entry ${entry.creationHeight}`}
                        disabled={!!reason || loading}
                        checked={checked}
                        onChange={(event) => toggle([entry], event.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">
                          {displayAmount(entry.balance)} {chain.displayDenom}
                        </span>
                        <span className="mt-1 block text-xs opacity-75">
                          Height {entry.creationHeight} · Completes{" "}
                          {new Date(entry.completionTime).toLocaleString()}
                        </span>
                        {reason && <span className="text-red-300">{reason}</span>}
                      </span>
                    </label>
                    {checked && (
                      <label className="ml-7 mt-2 flex flex-wrap items-center gap-2 text-xs">
                        Cancel amount ({chain.displayDenom})
                        <input
                          aria-label={`Cancel amount for entry ${entry.creationHeight}`}
                          className="min-w-0 flex-1 rounded border border-white/20 bg-fuchsia-950 p-2 text-sm"
                          inputMode="decimal"
                          value={selected[key]}
                          onChange={(event) => {
                            setSelected((previous) => ({ ...previous, [key]: event.target.value }));
                            setError("");
                          }}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      <div className="mt-4 rounded-lg border border-white/25 bg-fuchsia-950 p-4" aria-live="polite">
        <div className="font-semibold">
          {count} {count === 1 ? "entry" : "entries"} selected · {count}{" "}
          {count === 1 ? "message" : "messages"}
        </div>
        <div className="mt-1 text-lg">
          {total === undefined
            ? "Check selected amounts"
            : `${total} ${chain.displayDenom} returning to staking`}
        </div>
        <p className="mt-2 text-xs">
          Full balances are selected by default. Edit an amount for partial cancellation. All
          messages are approved together; if one fails on chain, the entire batch fails.
        </p>
      </div>
      <p className="mt-3 text-xs opacity-75">
        Gas below is an estimate based on the number of messages. Ledger compatibility depends on
        device and Cosmos app version.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-red-300">
          {error}
        </p>
      )}
    </StackableContainer>
  );
}
