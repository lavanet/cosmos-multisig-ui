import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import {
  MsgSetWithdrawAddress,
  MsgWithdrawDelegatorReward,
} from "cosmjs-types/cosmos/distribution/v1beta1/tx";
import { MsgVote } from "cosmjs-types/cosmos/gov/v1beta1/tx";
import {
  MsgBeginRedelegate,
  MsgDelegate,
  MsgUndelegate,
} from "cosmjs-types/cosmos/staking/v1beta1/tx";
import {
  MsgCreateVestingAccount,
  MsgCreatePeriodicVestingAccount,
} from "cosmjs-types/cosmos/vesting/v1beta1/tx";
import {
  MsgExecuteContract,
  MsgInstantiateContract,
  MsgInstantiateContract2,
  MsgMigrateContract,
} from "cosmjs-types/cosmwasm/wasm/v1/tx";
import { MsgGrant } from "cosmjs-types/cosmos/authz/v1beta1/tx";
import { MsgTransfer } from "cosmjs-types/ibc/applications/transfer/v1/tx";
import { MsgDualClaimRewards, MsgDualDelegate, MsgDualRedelegate, MsgDualUnbond } from "./lava";
import { StakeAuthorization } from "@lavanet/lavajs/dist/codegen/cosmos/staking/v1beta1/authz";

export const MsgTypeUrls = {
  Send: "/cosmos.bank.v1beta1.MsgSend",
  Vote: "/cosmos.gov.v1beta1.MsgVote",
  SetWithdrawAddress: "/cosmos.distribution.v1beta1.MsgSetWithdrawAddress",
  WithdrawDelegatorReward: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
  BeginRedelegate: "/cosmos.staking.v1beta1.MsgBeginRedelegate",
  Delegate: "/cosmos.staking.v1beta1.MsgDelegate",
  Undelegate: "/cosmos.staking.v1beta1.MsgUndelegate",
  CreateVestingAccount: "/cosmos.vesting.v1beta1.MsgCreateVestingAccount",
  Transfer: "/ibc.applications.transfer.v1.MsgTransfer",
  Execute: "/cosmwasm.wasm.v1.MsgExecuteContract",
  Instantiate: "/cosmwasm.wasm.v1.MsgInstantiateContract",
  Instantiate2: "/cosmwasm.wasm.v1.MsgInstantiateContract2",
  Migrate: "/cosmwasm.wasm.v1.MsgMigrateContract",
  DualDelegate: "/lavanet.lava.dualstaking.MsgDelegate",
  DualRedelegate: "/lavanet.lava.dualstaking.MsgRedelegate",
  DualUnbond: "/lavanet.lava.dualstaking.MsgUnbond",
  DualClaimRewards: "/lavanet.lava.dualstaking.MsgClaimRewards",
  CreatePeriodicVestingAccount: "/cosmos.vesting.v1beta1.MsgCreatePeriodicVestingAccount",
  MsgGrant: "/cosmos.authz.v1beta1.MsgGrant",
  StakeAuthorization: "/cosmos.staking.v1beta1.StakeAuthorization",
  MsgExecGrant: "/cosmos.authz.v1beta1.MsgExec",
} as const;

export type MsgTypeUrl = (typeof MsgTypeUrls)[keyof typeof MsgTypeUrls];

export const MsgCodecs = {
  [MsgTypeUrls.CreatePeriodicVestingAccount]: MsgCreatePeriodicVestingAccount,
  [MsgTypeUrls.Send]: MsgSend,
  [MsgTypeUrls.Vote]: MsgVote,
  [MsgTypeUrls.SetWithdrawAddress]: MsgSetWithdrawAddress,
  [MsgTypeUrls.WithdrawDelegatorReward]: MsgWithdrawDelegatorReward,
  [MsgTypeUrls.BeginRedelegate]: MsgBeginRedelegate,
  [MsgTypeUrls.Delegate]: MsgDelegate,
  [MsgTypeUrls.Undelegate]: MsgUndelegate,
  [MsgTypeUrls.CreateVestingAccount]: MsgCreateVestingAccount,
  [MsgTypeUrls.Transfer]: MsgTransfer,
  [MsgTypeUrls.Execute]: MsgExecuteContract,
  [MsgTypeUrls.Instantiate]: MsgInstantiateContract,
  [MsgTypeUrls.Instantiate2]: MsgInstantiateContract2,
  [MsgTypeUrls.Migrate]: MsgMigrateContract,
  [MsgTypeUrls.DualDelegate]: MsgDualDelegate,
  [MsgTypeUrls.DualRedelegate]: MsgDualRedelegate,
  [MsgTypeUrls.DualUnbond]: MsgDualUnbond,
  [MsgTypeUrls.DualClaimRewards]: MsgDualClaimRewards,
  [MsgTypeUrls.MsgGrant]: MsgGrant,
  [MsgTypeUrls.StakeAuthorization]: StakeAuthorization,
  [MsgTypeUrls.MsgExecGrant]: MsgGrant,
} as const;
export const SupportFileFeatureMsgTypes = [
  MsgTypeUrls.Send,
  MsgTypeUrls.WithdrawDelegatorReward,
  MsgTypeUrls.CreateVestingAccount,
  MsgTypeUrls.Transfer,
  MsgTypeUrls.CreatePeriodicVestingAccount,
  MsgTypeUrls.BeginRedelegate,
  MsgTypeUrls.Undelegate,
  MsgTypeUrls.Delegate,
  MsgTypeUrls.DualDelegate,
  MsgTypeUrls.DualRedelegate,
  MsgTypeUrls.DualClaimRewards,
  MsgTypeUrls.DualUnbond,
  MsgTypeUrls.MsgGrant,
  MsgTypeUrls.MsgExecGrant,
] as const;
// MsgTypes to load validator list
export const validatorMsgsType = [
  MsgTypeUrls.WithdrawDelegatorReward,
  MsgTypeUrls.BeginRedelegate,
  MsgTypeUrls.Undelegate,
  MsgTypeUrls.Delegate,
  MsgTypeUrls.DualDelegate,
  MsgTypeUrls.DualUnbond,
];
