import { fromBech32 } from "@cosmjs/encoding";
import { EncodeObject } from "@cosmjs/proto-signing";
import { MsgExec } from "cosmjs-types/cosmos/authz/v1beta1/tx";
import { MsgVote as VoteV1 } from "cosmjs-types/cosmos/gov/v1/tx";
import { z } from "zod";
import { MsgCodecs, MsgTypeUrls } from "../../types/txMsg";
import { MsgBase } from "../msg_authz_registry/base.authz";

export const EXEC = MsgTypeUrls.MsgExecGrant;
export const VOTE_V1 = "/cosmos.gov.v1.MsgVote";
export const MAX_ACTIONS = 100;
const integer = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .max(78);
const coin = z.object({ denom: z.string().min(1).max(128), amount: integer }).strict();
const address = z.string().min(1).max(128);
const staking = { delegatorAddress: address, validatorAddress: address, amount: coin };
const dual = {
  creator: address,
  validator: address,
  provider: address,
  chainID: z.string().max(128).optional(),
  amount: coin,
};
const vote = {
  voter: address,
  proposalId: integer.refine((v) => BigInt(v) <= BigInt("18446744073709551615")),
  option: z.union([
    z.number().int().min(1).max(4),
    z.enum([
      "VOTE_OPTION_YES",
      "VOTE_OPTION_ABSTAIN",
      "VOTE_OPTION_NO",
      "VOTE_OPTION_NO_WITH_VETO",
    ]),
  ]),
};
const schemas: Record<string, z.ZodTypeAny> = {
  [MsgTypeUrls.Send]: z
    .object({ fromAddress: address, toAddress: address, amount: z.array(coin).min(1).max(50) })
    .strict(),
  [MsgTypeUrls.Vote]: z.object(vote).strict(),
  [VOTE_V1]: z.object({ ...vote, metadata: z.string().max(10000).optional() }).strict(),
  [MsgTypeUrls.WithdrawDelegatorReward]: z
    .object({ delegatorAddress: address, validatorAddress: address })
    .strict(),
  [MsgTypeUrls.Undelegate]: z.object(staking).strict(),
  [MsgTypeUrls.Delegate]: z.object(staking).strict(),
  [MsgTypeUrls.BeginRedelegate]: z
    .object({
      delegatorAddress: address,
      validatorSrcAddress: address,
      validatorDstAddress: address,
      amount: coin,
    })
    .strict(),
  [MsgTypeUrls.DualUnbond]: z.object(dual).strict(),
  [MsgTypeUrls.DualDelegate]: z.object(dual).strict(),
  [MsgTypeUrls.DualRedelegate]: z
    .object({
      creator: address,
      fromProvider: address,
      toProvider: address,
      fromChainID: z.string().optional(),
      toChainID: z.string().optional(),
      amount: coin,
    })
    .strict(),
  [MsgTypeUrls.DualClaimRewards]: z
    .object({ creator: address, provider: z.string().optional() })
    .strict(),
};
const codecs = { ...MsgCodecs, [VOTE_V1]: VoteV1 };

export const guidedActions = [
  { typeUrl: MsgTypeUrls.Send, label: "Transfer tokens" },
  { typeUrl: MsgTypeUrls.Vote, label: "Vote (legacy grant)" },
  { typeUrl: VOTE_V1, label: "Vote" },
  { typeUrl: MsgTypeUrls.WithdrawDelegatorReward, label: "Claim delegation rewards" },
  { typeUrl: MsgTypeUrls.Undelegate, label: "Staking unbond" },
  { typeUrl: MsgTypeUrls.DualUnbond, label: "Lava dualstaking unbond" },
];
export function checkAccount(value: string, prefix: string): void {
  const decoded = fromBech32(value);
  if (decoded.prefix !== prefix || ![20, 32].includes(decoded.data.length)) {
    throw new Error(`Expected a ${prefix} address`);
  }
}
export function innerActor(msg: EncodeObject): string {
  return (
    msg.value.fromAddress ?? msg.value.delegatorAddress ?? msg.value.voter ?? msg.value.creator
  );
}
export function normalizeInner(msg: EncodeObject, prefix: string): EncodeObject {
  const schema = schemas[msg.typeUrl];
  if (!schema) throw new Error(`Unsupported authz action: ${msg.typeUrl}`);
  // Persisted JSON uses integer strings; decoded values may contain bigint.
  const input = JSON.parse(
    JSON.stringify(msg.value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
  const value = schema.parse(input);
  const actor = innerActor({ ...msg, value });
  checkAccount(actor, prefix);
  for (const field of ["toAddress"]) if (value[field]) checkAccount(value[field], prefix);
  for (const field of [
    "validatorAddress",
    "validatorSrcAddress",
    "validatorDstAddress",
    "validator",
  ]) {
    if (value[field]) checkAccount(value[field], `${prefix}valoper`);
  }
  for (const field of ["provider", "fromProvider", "toProvider"]) {
    if (value[field] && value[field] !== "empty_provider") checkAccount(value[field], prefix);
  }
  if (Array.isArray(value.amount)) {
    const denoms = value.amount.map((c: { denom: string }) => c.denom);
    if (new Set(denoms).size !== denoms.length) throw new Error("Duplicate token denomination");
    if (denoms.some((d: string, i: number) => i > 0 && d <= denoms[i - 1])) {
      throw new Error("Token denominations must be sorted");
    }
  }
  const codec = codecs[msg.typeUrl as keyof typeof codecs];
  return { typeUrl: msg.typeUrl, value: codec.fromJSON(value) };
}
export function normalizeExec(msg: EncodeObject, expectedGrantee?: string): EncodeObject {
  if (msg.typeUrl !== EXEC) throw new Error("Authz and regular messages cannot be mixed");
  const envelope = z
    .object({
      grantee: address,
      msgs: z
        .array(z.object({ typeUrl: z.string(), value: z.unknown() }).strict())
        .min(1)
        .max(MAX_ACTIONS),
    })
    .strict()
    .parse(msg.value);
  if (expectedGrantee && envelope.grantee !== expectedGrantee) {
    throw new Error("Execution grantee must be this multisig");
  }
  const prefix = fromBech32(envelope.grantee).prefix;
  checkAccount(envelope.grantee, prefix);
  const msgs = envelope.msgs.map((m) => normalizeInner(m as EncodeObject, prefix));
  return { typeUrl: EXEC, value: { grantee: envelope.grantee, msgs } };
}
export function execToJson(msg: EncodeObject): EncodeObject {
  const normalized = normalizeExec(msg);
  return {
    typeUrl: EXEC,
    value: {
      grantee: normalized.value.grantee,
      msgs: normalized.value.msgs.map((m: EncodeObject) => ({
        typeUrl: m.typeUrl,
        value: codecs[m.typeUrl as keyof typeof codecs].toJSON(m.value),
      })),
    },
  };
}
class InnerMessage extends MsgBase {
  constructor(msg: EncodeObject) {
    super(msg.value);
    this.typeUrl = msg.typeUrl;
  }
  toBinary(): Uint8Array {
    return codecs[this.typeUrl as keyof typeof codecs].encode(this.value).finish();
  }
  toAmino() {
    if (this.typeUrl === VOTE_V1) {
      return {
        type: "cosmos-sdk/v1/MsgVote",
        value: {
          proposal_id: this.value.proposalId.toString(),
          voter: this.value.voter,
          option: this.value.option,
          ...(this.value.metadata ? { metadata: this.value.metadata } : {}),
        },
      };
    }
    return super.toAmino();
  }
}
class ExecMessage extends MsgBase {
  typeUrl = EXEC;
  messages: InnerMessage[];
  constructor(msg: EncodeObject) {
    super(msg.value);
    this.messages = msg.value.msgs.map((m: EncodeObject) => new InnerMessage(m));
  }
  toBinary(): Uint8Array {
    return MsgExec.encode({
      grantee: this.value.grantee,
      msgs: this.messages.map((m) => m.toProto()),
    }).finish();
  }
  toAmino() {
    return {
      type: "cosmos-sdk/MsgExec",
      value: { grantee: this.value.grantee, msgs: this.messages.map((m) => m.toAmino()) },
    };
  }
}
export function execMessages(messages: readonly EncodeObject[], grantee?: string): ExecMessage[] {
  if (!messages.length || messages.length > MAX_ACTIONS) {
    throw new Error("Invalid execution message count");
  }
  const result = messages.map((m) => new ExecMessage(normalizeExec(m, grantee)));
  if (result.reduce((sum, m) => sum + m.messages.length, 0) > MAX_ACTIONS) {
    throw new Error(`At most ${MAX_ACTIONS} actions per proposal`);
  }
  return result;
}
export const hasExec = (messages: readonly EncodeObject[]) =>
  messages.some((m) => m.typeUrl === EXEC);
