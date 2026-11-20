import { Grant, GenericAuthorization } from "cosmjs-types/cosmos/authz/v1beta1/authz";
import { SendAuthorization } from "cosmjs-types/cosmos/bank/v1beta1/authz";
import { StakeAuthorization } from "cosmjs-types/cosmos/staking/v1beta1/authz";
import { EncodeObject } from "@cosmjs/proto-signing";
import { Coin } from "@cosmjs/amino";
import { MsgTypeUrls } from "../../types/txMsg";

export interface Permission {
  typeUrl: string;
  kind: "generic" | "send" | "stake" | "unsupported";
  expires?: number;
  limits?: Coin[];
  recipients?: string[];
  allow?: string[];
  deny?: string[];
}
export function decodeGrant(grant: Grant): Permission {
  const expires = grant.expiration
    ? Number(grant.expiration.seconds) * 1000 + grant.expiration.nanos / 1e6
    : undefined;
  const auth = grant.authorization;
  if (!auth) throw new Error("Grant authorization is missing");
  switch (auth.typeUrl) {
    case "/cosmos.authz.v1beta1.GenericAuthorization":
      return { kind: "generic", typeUrl: GenericAuthorization.decode(auth.value).msg, expires };
    case "/cosmos.bank.v1beta1.SendAuthorization": {
      const value = SendAuthorization.decode(auth.value);
      return {
        kind: "send",
        typeUrl: MsgTypeUrls.Send,
        expires,
        limits: value.spendLimit,
        recipients: value.allowList,
      };
    }
    case "/cosmos.staking.v1beta1.StakeAuthorization": {
      const value = StakeAuthorization.decode(auth.value);
      const typeUrl = [
        "",
        MsgTypeUrls.Delegate,
        MsgTypeUrls.Undelegate,
        MsgTypeUrls.BeginRedelegate,
      ][value.authorizationType];
      return {
        kind: typeUrl ? "stake" : "unsupported",
        typeUrl: typeUrl || auth.typeUrl,
        expires,
        limits: value.maxTokens ? [value.maxTokens] : undefined,
        allow: value.allowList?.address,
        deny: value.denyList?.address,
      };
    }
    default:
      return { kind: "unsupported", typeUrl: auth.typeUrl, expires };
  }
}
export function availablePermission(permissions: Permission[], typeUrl: string, now: number) {
  return permissions.find(
    (p) =>
      p.kind !== "unsupported" &&
      p.typeUrl === typeUrl &&
      (p.expires === undefined || p.expires > now),
  );
}
export function validatePermissions(
  permissions: Permission[],
  messages: readonly EncodeObject[],
  now: number,
): void {
  const remaining = new Map<Permission, Map<string, bigint>>();
  for (const message of messages) {
    const permission = availablePermission(permissions, message.typeUrl, now);
    if (!permission) {
      throw new Error(`Missing, expired or unsupported grant for ${message.typeUrl}`);
    }
    const value = message.value;
    if (permission.recipients?.length && !permission.recipients.includes(value.toAddress)) {
      throw new Error("Recipient is not allowed by the send grant");
    }
    const validator = value.validatorAddress ?? value.validatorDstAddress;
    if (permission.allow?.length && !permission.allow.includes(validator)) {
      throw new Error("Validator is not allowed by the staking grant");
    }
    if (permission.deny?.includes(validator)) {
      throw new Error("Validator is denied by the staking grant");
    }
    if (permission.limits) {
      let balance = remaining.get(permission);
      if (!balance) {
        balance = new Map(permission.limits.map((c) => [c.denom, BigInt(c.amount)]));
        remaining.set(permission, balance);
      }
      const coins: Coin[] = Array.isArray(value.amount) ? value.amount : [value.amount];
      for (const coin of coins) {
        const next = (balance.get(coin.denom) ?? BigInt(0)) - BigInt(coin.amount);
        if (next < BigInt(0)) {
          throw new Error(`Batch exceeds the remaining grant allowance for ${coin.denom}`);
        }
        balance.set(coin.denom, next);
      }
    }
  }
}
