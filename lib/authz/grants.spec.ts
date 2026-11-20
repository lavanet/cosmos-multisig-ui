/** @jest-environment node */
import { SendAuthorization } from "cosmjs-types/cosmos/bank/v1beta1/authz";
import { StakeAuthorization } from "cosmjs-types/cosmos/staking/v1beta1/authz";
import { MsgTypeUrls } from "../../types/txMsg";
import { decodeGrant, Permission, validatePermissions } from "./grants";
import { validateResources } from "./preflight";
import { AuthzAccount } from "./queries";
const send = (amount: string, denom = "ulava", toAddress = "recipient") => ({
  typeUrl: MsgTypeUrls.Send,
  value: { fromAddress: "granter", toAddress, amount: [{ denom, amount }] },
});
const permission: Permission = {
  kind: "send",
  typeUrl: MsgTypeUrls.Send,
  limits: [{ denom: "ulava", amount: "9007199254740993" }],
  recipients: ["recipient"],
  expires: 1000,
};
it("decodes remaining send limits and recipients", () => {
  const value = SendAuthorization.encode(
    SendAuthorization.fromPartial({
      spendLimit: permission.limits,
      allowList: permission.recipients,
    }),
  ).finish();
  expect(
    decodeGrant({
      authorization: { typeUrl: "/cosmos.bank.v1beta1.SendAuthorization", value },
      expiration: { seconds: BigInt(1), nanos: 0 },
    }),
  ).toEqual(permission);
});
it("enforces aggregated exact integer allowances and recipients", () => {
  expect(() =>
    validatePermissions([permission], [send("9007199254740992"), send("1")], 999),
  ).not.toThrow();
  expect(() =>
    validatePermissions([permission], [send("9007199254740992"), send("2")], 999),
  ).toThrow(/allowance/);
  expect(() => validatePermissions([permission], [send("1", "other")], 999)).toThrow(/allowance/);
  expect(() => validatePermissions([permission], [send("1", "ulava", "attacker")], 999)).toThrow(
    /Recipient/,
  );
  expect(permission.limits![0].amount).toBe("9007199254740993");
});
it("fails closed on expired, missing, unknown or different-version grants", () => {
  expect(() => validatePermissions([permission], [send("1")], 1000)).toThrow(/expired/);
  expect(() => validatePermissions([], [send("1")], 0)).toThrow();
  expect(() =>
    validatePermissions([{ kind: "unsupported", typeUrl: MsgTypeUrls.Send }], [send("1")], 0),
  ).toThrow();
  expect(() =>
    validatePermissions(
      [{ kind: "generic", typeUrl: MsgTypeUrls.Vote }],
      [{ typeUrl: "/cosmos.gov.v1.MsgVote", value: {} }],
      0,
    ),
  ).toThrow();
});
it("respects StakeAuthorization type, validator restrictions and max tokens", () => {
  const value = StakeAuthorization.encode(
    StakeAuthorization.fromPartial({
      authorizationType: 2,
      maxTokens: { denom: "ulava", amount: "10" },
      allowList: { address: ["validator"] },
    }),
  ).finish();
  const p = decodeGrant({
    authorization: { typeUrl: "/cosmos.staking.v1beta1.StakeAuthorization", value },
  });
  const msg = {
    typeUrl: MsgTypeUrls.Undelegate,
    value: { validatorAddress: "validator", amount: { denom: "ulava", amount: "6" } },
  };
  expect(() => validatePermissions([p], [msg], 0)).not.toThrow();
  expect(() => validatePermissions([p], [msg, msg], 0)).toThrow(/allowance/);
  expect(() => validatePermissions([{ ...p, allow: ["other"] }], [msg], 0)).toThrow(/not allowed/);
  expect(() => validatePermissions([{ ...p, deny: ["validator"] }], [msg], 0)).toThrow(/denied/);
  expect(() => validatePermissions([p], [{ ...msg, typeUrl: MsgTypeUrls.DualUnbond }], 0)).toThrow(
    /Missing/,
  );
});
const state: AuthzAccount = {
  granter: "granter",
  grantee: "multisig",
  height: 1,
  time: 1,
  permissions: [MsgTypeUrls.Send, MsgTypeUrls.Undelegate, MsgTypeUrls.DualUnbond].map(
    (typeUrl) => ({ typeUrl, kind: "generic" }),
  ),
  spendable: [{ denom: "ulava", amount: "10" }],
  bondDenom: "ulava",
  delegations: [{ validator: "validator", amount: "10" }],
  providers: [{ provider: "provider", amount: "4" }],
  rewards: [],
  proposals: [],
  withdrawAddress: "granter",
};
it("uses spendable balances, not locked vesting amounts", () => {
  expect(() => validateResources(state, [send("10")])).not.toThrow();
  expect(() => validateResources(state, [send("6"), send("5")])).toThrow(/spendable/);
  expect(() =>
    validateResources(state, [
      { ...send("1"), value: { ...send("1").value, fromAddress: "other" } },
    ]),
  ).toThrow(/actor/);
});
it("shares the validator budget across staking and dualstaking actions", () => {
  const stake = {
    typeUrl: MsgTypeUrls.Undelegate,
    value: {
      delegatorAddress: "granter",
      validatorAddress: "validator",
      amount: { denom: "ulava", amount: "7" },
    },
  };
  const dual = {
    typeUrl: MsgTypeUrls.DualUnbond,
    value: {
      creator: "granter",
      validator: "validator",
      provider: "provider",
      amount: { denom: "ulava", amount: "4" },
    },
  };
  expect(() => validateResources(state, [stake, dual])).toThrow(/validator delegation/);
  expect(() => validateResources(state, [dual])).not.toThrow();
  expect(() => validateResources(state, [dual, dual])).toThrow(/provider allocation/);
});
it("shares bank funds across sends and both delegation types while allowing locked tokens to stake", () => {
  const account: AuthzAccount = {
    ...state,
    permissions: [
      ...state.permissions,
      ...[MsgTypeUrls.Delegate, MsgTypeUrls.DualDelegate].map((typeUrl) => ({
        typeUrl,
        kind: "generic" as const,
      })),
    ],
    stakingBalance: [{ denom: "ulava", amount: "20" }],
  };
  const delegate = {
    typeUrl: MsgTypeUrls.Delegate,
    value: {
      delegatorAddress: "granter",
      validatorAddress: "validator",
      amount: { denom: "ulava", amount: "15" },
    },
  };
  const dual = {
    typeUrl: MsgTypeUrls.DualDelegate,
    value: {
      creator: "granter",
      validator: "validator",
      provider: "provider",
      amount: { denom: "ulava", amount: "6" },
    },
  };
  expect(() => validateResources(account, [delegate])).not.toThrow();
  expect(() => validateResources(account, [delegate, send("5")])).not.toThrow();
  expect(() => validateResources(account, [send("6"), delegate])).toThrow(/bank balance/);
  expect(() => validateResources(account, [delegate, dual])).toThrow(/bank balance/);
  expect(() => validateResources(account, [send("11")])).toThrow(/spendable/);
  expect(() =>
    validateResources(account, [
      { ...delegate, value: { ...delegate.value, amount: { denom: "other", amount: "1" } } },
    ]),
  ).toThrow(/denomination/);
});
it("shares existing stake and provider allocations between redelegation and unbonding", () => {
  const account: AuthzAccount = {
    ...state,
    permissions: [
      ...state.permissions,
      ...[MsgTypeUrls.BeginRedelegate, MsgTypeUrls.DualRedelegate].map((typeUrl) => ({
        typeUrl,
        kind: "generic" as const,
      })),
    ],
  };
  const redelegate = {
    typeUrl: MsgTypeUrls.BeginRedelegate,
    value: {
      delegatorAddress: "granter",
      validatorSrcAddress: "validator",
      validatorDstAddress: "destination",
      amount: { denom: "ulava", amount: "7" },
    },
  };
  const dual = {
    typeUrl: MsgTypeUrls.DualRedelegate,
    value: {
      creator: "granter",
      fromProvider: "provider",
      toProvider: "destination",
      amount: { denom: "ulava", amount: "3" },
    },
  };
  expect(() => validateResources(account, [redelegate, dual])).not.toThrow();
  expect(() =>
    validateResources(account, [
      redelegate,
      {
        typeUrl: MsgTypeUrls.Undelegate,
        value: {
          delegatorAddress: "granter",
          validatorAddress: "validator",
          amount: { denom: "ulava", amount: "4" },
        },
      },
    ]),
  ).toThrow(/validator delegation/);
  expect(() =>
    validateResources(account, [
      dual,
      {
        typeUrl: MsgTypeUrls.DualUnbond,
        value: {
          creator: "granter",
          validator: "validator",
          provider: "provider",
          amount: { denom: "ulava", amount: "2" },
        },
      },
    ]),
  ).toThrow(/provider allocation/);
  expect(() =>
    validateResources(account, [
      { ...redelegate, value: { ...redelegate.value, validatorDstAddress: "validator" } },
    ]),
  ).toThrow(/different/);
  expect(() =>
    validateResources(account, [{ ...dual, value: { ...dual.value, toProvider: "provider" } }]),
  ).toThrow(/different/);
});
it.each([MsgTypeUrls.Delegate, MsgTypeUrls.BeginRedelegate])(
  "checks destination validator restrictions for %s",
  (typeUrl) => {
    const msg = {
      typeUrl,
      value: {
        validatorAddress: typeUrl === MsgTypeUrls.Delegate ? "target" : undefined,
        validatorSrcAddress: "source",
        validatorDstAddress: "target",
        amount: { denom: "ulava", amount: "2" },
      },
    };
    const grant: Permission = {
      typeUrl,
      kind: "stake",
      allow: ["target"],
      limits: [{ denom: "ulava", amount: "3" }],
    };
    expect(() => validatePermissions([grant], [msg], 0)).not.toThrow();
    expect(() => validatePermissions([grant], [msg, msg], 0)).toThrow(/allowance/);
    expect(() => validatePermissions([{ ...grant, allow: ["source"] }], [msg], 0)).toThrow(
      /not allowed/,
    );
  },
);
