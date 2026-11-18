import { MultisigThresholdPubkey, pubkeyToAddress } from "@cosmjs/amino";
import { EncodeObject } from "@cosmjs/proto-signing";
import { makeMultisignedTxBytes, StargateClient } from "@cosmjs/stargate";
import { DbTransaction } from "../../types";
import { MsgTypeUrls } from "../../types/txMsg";
import { approvedTransaction } from "../transactionIntegrity";
import { AuthzAccount, loadAuthzAccount, simulateBytes } from "./queries";
import { execMessages, innerActor, normalizeExec, VOTE_V1 } from "./messages";
import { validatePermissions } from "./grants";

export function validateResources(state: AuthzAccount, messages: readonly EncodeObject[]): void {
  validatePermissions(state.permissions, messages, state.time);
  const funds = new Map(state.spendable.map((c) => [c.denom, BigInt(c.amount)]));
  const stake = new Map(state.delegations.map((d) => [d.validator, BigInt(d.amount)]));
  const providers = new Map(state.providers.map((d) => [d.provider, BigInt(d.amount)]));
  const consume = (balances: Map<string, bigint>, key: string, amount: string, label: string) => {
    const next = (balances.get(key) ?? BigInt(0)) - BigInt(amount);
    if (next < BigInt(0)) throw new Error(`Batch exceeds ${label} for ${key}`);
    balances.set(key, next);
  };
  for (const msg of messages) {
    if (innerActor(msg) !== state.granter) {
      throw new Error("Inner message actor must match the granter");
    }
    const v = msg.value;
    if (msg.typeUrl === MsgTypeUrls.Send) {
      for (const c of v.amount) consume(funds, c.denom, c.amount, "spendable balance");
    }
    if (msg.typeUrl === MsgTypeUrls.Undelegate || msg.typeUrl === MsgTypeUrls.DualUnbond) {
      if (v.amount.denom !== state.bondDenom) throw new Error("Incorrect staking denomination");
      consume(stake, v.validatorAddress ?? v.validator, v.amount.amount, "validator delegation");
      if (msg.typeUrl === MsgTypeUrls.DualUnbond) {
        consume(providers, v.provider, v.amount.amount, "provider allocation");
      }
    }
    if (
      (msg.typeUrl === MsgTypeUrls.Vote || msg.typeUrl === VOTE_V1) &&
      !state.proposals.some((p) => p.id === v.proposalId.toString())
    ) {
      throw new Error("Proposal is not in its voting period");
    }
  }
}
export async function preflightExec(
  url: string,
  prefix: string,
  tx: DbTransaction,
  pubkey: MultisigThresholdPubkey,
  signedBytes?: Uint8Array,
): Promise<number> {
  const grantee = pubkeyToAddress(pubkey, prefix);
  execMessages(tx.msgs, grantee);
  const groups = new Map<string, EncodeObject[]>();
  for (const envelope of tx.msgs.map((m) => normalizeExec(m, grantee))) {
    for (const msg of envelope.value.msgs as EncodeObject[]) {
      const granter = innerActor(msg);
      groups.set(granter, [...(groups.get(granter) || []), msg]);
    }
  }
  for (const [granter, messages] of groups) {
    validateResources(await loadAuthzAccount(url, tx.chainId, prefix, granter, grantee), messages);
  }
  const client = await StargateClient.connect(url);
  try {
    if ((await client.getChainId()) !== tx.chainId) throw new Error("Wrong chain");
    const account = await client.getAccount(grantee);
    if (
      !account ||
      account.sequence !== tx.sequence ||
      account.accountNumber !== tx.accountNumber
    ) {
      throw new Error("Multisig sequence changed. Create a new proposal.");
    }
    for (const fee of tx.fee.amount) {
      const balance = await client.getBalance(grantee, fee.denom);
      if (BigInt(balance.amount) < BigInt(fee.amount)) {
        throw new Error("Multisig has insufficient funds for fees");
      }
    }
  } finally {
    client.disconnect();
  }
  // Use every member in the unsigned simulation: a conservative gas estimate if more than the threshold sign.
  const dummy = new Map(
    pubkey.value.pubkeys.map((key) => [pubkeyToAddress(key, prefix), new Uint8Array(64)]),
  );
  const bytes =
    signedBytes ??
    makeMultisignedTxBytes(
      pubkey,
      tx.sequence,
      tx.fee,
      approvedTransaction(tx, grantee).body,
      dummy,
    );
  return simulateBytes(url, tx.chainId, bytes);
}
