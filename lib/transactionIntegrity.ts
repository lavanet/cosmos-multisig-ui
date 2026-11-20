import { AminoTypes, createDefaultAminoConverters } from "@cosmjs/stargate";
import {
  MultisigThresholdPubkey,
  makeSignDoc,
  pubkeyToAddress,
  serializeSignDoc,
  StdSignDoc,
} from "@cosmjs/amino";
import { fromBase64, toBase64 } from "@cosmjs/encoding";
import { Secp256k1, Secp256k1Signature, sha256 } from "@cosmjs/crypto";
import { Registry } from "@cosmjs/proto-signing";
import { defaultRegistryTypes } from "@cosmjs/stargate";
import { createWasmAminoConverters, wasmTypes } from "@cosmjs/cosmwasm-stargate";
import * as lavajs from "@lavanet/lavajs";
import { TxBody } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { DbTransaction, DbSignature } from "../types";
import { createAuthzAminoConverters, msgGrantTypes } from "./grantDecoder";
import {
  createPeriodicVestingAccount,
  periodicVestingTypes,
} from "./periodicVestingAccountDecoder";
import { execMessages, hasExec } from "./authz/messages";

export function approvedTransaction(tx: DbTransaction, grantee?: string) {
  if (
    !Number.isSafeInteger(tx.accountNumber) ||
    tx.accountNumber < 0 ||
    !Number.isSafeInteger(tx.sequence) ||
    tx.sequence < 0 ||
    !tx.chainId ||
    !tx.msgs.length
  ) {
    throw new Error("Invalid transaction account, chain or sequence");
  }
  if (hasExec(tx.msgs)) {
    const messages = execMessages(tx.msgs, grantee);
    return {
      body: TxBody.encode(
        TxBody.fromPartial({ messages: messages.map((m) => m.toProto()), memo: tx.memo }),
      ).finish(),
      signDoc: makeSignDoc(
        messages.map((m) => m.toAmino()),
        tx.fee,
        tx.chainId,
        tx.memo,
        tx.accountNumber,
        tx.sequence,
      ),
    };
  }
  const amino = new AminoTypes({
    ...createDefaultAminoConverters(),
    ...createWasmAminoConverters(),
    ...lavajs.lavanetAminoConverters,
    ...createPeriodicVestingAccount(),
    ...createAuthzAminoConverters(),
  });
  const registry = new Registry([
    ...defaultRegistryTypes,
    ...wasmTypes,
    ...lavajs.lavanetProtoRegistry,
    ...periodicVestingTypes,
    ...msgGrantTypes,
  ]);
  const messages = tx.msgs.map((m) => amino.toAmino(m));
  return {
    body: TxBody.encode(
      TxBody.fromPartial({
        messages: messages.map((m) => registry.encodeAsAny(amino.fromAmino(m))),
        memo: tx.memo,
      }),
    ).finish(),
    signDoc: makeSignDoc(messages, tx.fee, tx.chainId, tx.memo, tx.accountNumber, tx.sequence),
  };
}
export function assertSameSignDoc(expected: StdSignDoc, actual: StdSignDoc): void {
  if (toBase64(serializeSignDoc(expected)) !== toBase64(serializeSignDoc(actual))) {
    throw new Error(
      "Wallet changed the approved transaction. No signature was saved. Create a new proposal to change its contents or fees.",
    );
  }
}
export async function verifiedSignatures(
  tx: DbTransaction,
  pubkey: MultisigThresholdPubkey,
  prefix: string,
  signatures: readonly DbSignature[],
  expectedAddress?: string,
): Promise<DbSignature[]> {
  const multisig = pubkeyToAddress(pubkey, prefix);
  if (expectedAddress && multisig !== expectedAddress) {
    throw new Error("Multisig public key does not match the account");
  }
  const approved = approvedTransaction(tx, multisig);
  const body = toBase64(approved.body),
    digest = sha256(serializeSignDoc(approved.signDoc));
  const members = new Map(pubkey.value.pubkeys.map((key) => [pubkeyToAddress(key, prefix), key]));
  const valid = new Map<string, DbSignature>();
  for (const signature of signatures) {
    const key = members.get(signature.address);
    if (!key || valid.has(signature.address) || signature.bodyBytes !== body) continue;
    try {
      if (typeof key.value !== "string" || key.type !== "tendermint/PubKeySecp256k1") continue;
      const bytes = fromBase64(signature.signature);
      if (bytes.length !== 64) continue;
      if (
        await Secp256k1.verifySignature(
          Secp256k1Signature.fromFixedLength(bytes),
          digest,
          fromBase64(key.value),
        )
      ) {
        valid.set(signature.address, signature);
      }
    } catch {
      /* An invalid stored signature must never count toward quorum. */
    }
  }
  return Array.from(valid.values());
}
