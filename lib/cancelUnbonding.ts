import { EncodeObject } from "@cosmjs/proto-signing";
import { QueryClient, setupStakingExtension } from "@cosmjs/stargate";
import { connectComet } from "@cosmjs/tendermint-rpc";
import { MsgCancelUnbondingDelegation } from "cosmjs-types/cosmos/staking/v1beta1/tx";
import { MsgTypeUrls } from "../types/txMsg";

export interface UnbondingEntry {
  validatorAddress: string;
  validatorName: string;
  creationHeight: string;
  balance: string;
  completionTime: number;
  unavailableReason: string;
}
export interface UnbondingSnapshot {
  denom: string;
  entries: UnbondingEntry[];
  blockTime: number;
}
export const entryKey = (entry: Pick<UnbondingEntry, "validatorAddress" | "creationHeight">) =>
  `${entry.validatorAddress}/${entry.creationHeight}`;

export async function getUnbondingSnapshot(
  rpcUrl: string,
  delegator: string,
): Promise<UnbondingSnapshot> {
  const comet = await connectComet(rpcUrl);
  try {
    const client = QueryClient.withExtensions(comet, setupStakingExtension);
    const [params, block] = await Promise.all([client.staking.params(), comet.block()]);
    if (!params.params?.bondDenom) throw new Error("Staking denomination unavailable");
    const entries: UnbondingEntry[] = [];
    let key: Uint8Array | undefined;
    do {
      const response = await client.staking.delegatorUnbondingDelegations(delegator, key);
      for (const delegation of response.unbondingResponses) {
        const { validator } = await client.staking.validator(delegation.validatorAddress);
        for (const entry of delegation.entries) {
          const completionTime = entry.completionTime
            ? Number(entry.completionTime.seconds) * 1000 + entry.completionTime.nanos / 1e6
            : 0;
          entries.push({
            validatorAddress: delegation.validatorAddress,
            validatorName: validator?.description?.moniker || delegation.validatorAddress,
            creationHeight: entry.creationHeight.toString(),
            balance: entry.balance,
            completionTime,
            unavailableReason: !validator
              ? "Validator unavailable"
              : validator.jailed
              ? "Validator is jailed"
              : BigInt(validator.tokens) === BigInt(0) && Number(validator.delegatorShares) > 0
              ? "Invalid validator exchange rate"
              : "",
          });
        }
      }
      key = response.pagination?.nextKey;
    } while (key?.length);
    return {
      denom: params.params.bondDenom,
      entries,
      blockTime: block.block.header.time.getTime(),
    };
  } finally {
    comet.disconnect();
  }
}

export function validateCancellation(
  snapshot: UnbondingSnapshot,
  msg: MsgCancelUnbondingDelegation,
  now = snapshot.blockTime,
): void {
  if (msg.creationHeight <= BigInt(0) || msg.creationHeight > BigInt("9223372036854775807")) {
    throw new Error("Invalid creation height");
  }
  const entry = snapshot.entries.find(
    (item) =>
      entryKey(item) ===
      entryKey({
        validatorAddress: msg.validatorAddress,
        creationHeight: msg.creationHeight.toString(),
      }),
  );
  if (!entry) {
    throw new Error("Unbonding entry no longer exists. Refresh or create a new proposal.");
  }
  if (entry.unavailableReason) throw new Error(entry.unavailableReason);
  if (entry.completionTime <= now) {
    throw new Error("Unbonding entry has completed. Create a new proposal.");
  }
  if (!msg.amount || msg.amount.denom !== snapshot.denom) {
    throw new Error("Incorrect staking denomination");
  }
  if (!/^[0-9]+$/.test(msg.amount.amount) || BigInt(msg.amount.amount) <= BigInt(0)) {
    throw new Error("Amount must be greater than zero");
  }
  if (BigInt(msg.amount.amount) > BigInt(entry.balance)) {
    throw new Error("Amount exceeds the remaining unbonding balance");
  }
}

export async function validateCancelUnbondingMessages(
  rpcUrl: string,
  messages: readonly EncodeObject[],
  delegator: string,
) {
  const cancellations = messages.filter(
    (msg) => msg.typeUrl === MsgTypeUrls.CancelUnbondingDelegation,
  );
  if (!cancellations.length) return;
  const snapshot = await getUnbondingSnapshot(rpcUrl, delegator);
  for (const encoded of cancellations) {
    const msg = MsgCancelUnbondingDelegation.fromJSON(encoded.value);
    if (msg.delegatorAddress !== delegator) {
      throw new Error("Cancellation delegator must be the multisig address");
    }
    validateCancellation(snapshot, msg);
    // Account for multiple messages targeting the same entry in this transaction.
    const entry = snapshot.entries.find(
      (item) =>
        entryKey(item) ===
        entryKey({
          validatorAddress: msg.validatorAddress,
          creationHeight: msg.creationHeight.toString(),
        }),
    )!;
    entry.balance = (BigInt(entry.balance) - BigInt(msg.amount!.amount)).toString();
  }
}
