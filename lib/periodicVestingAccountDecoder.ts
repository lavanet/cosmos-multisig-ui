import { MsgTypeUrls } from "@/types/txMsg";
import { MsgCreatePeriodicVestingAccount } from "cosmjs-types/cosmos/vesting/v1beta1/tx";
import { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin";
import { GeneratedType } from "@cosmjs/proto-signing";
import {
    AminoConverters,
} from "@cosmjs/stargate";

interface AminoMsgCreatePeriodicVestingAccount {
  readonly type: "cosmos-sdk/MsgCreatePeriodVestAccount";
  readonly value: {
    readonly from_address: string;
    readonly to_address: string;
    readonly start_time: string;
    readonly vesting_periods: {
      readonly length: string;
      readonly amount: Coin[];
    }[];
  };
}
export function createPeriodicVestingAccount(): AminoConverters {
  return {
    [MsgTypeUrls.CreatePeriodicVestingAccount]: {
      aminoType: "cosmos-sdk/MsgCreatePeriodVestAccount",
      toAmino: ({
        fromAddress,
        toAddress,
        startTime,
        vestingPeriods
      }: MsgCreatePeriodicVestingAccount): AminoMsgCreatePeriodicVestingAccount['value'] => ({
        from_address: fromAddress,
        to_address: toAddress,
        start_time: startTime.toString(),
        vesting_periods: vestingPeriods.map(({ length, amount }) => ({
          length: length.toString(),
          amount,
        })),
      }),
      fromAmino: (data: AminoMsgCreatePeriodicVestingAccount['value']): MsgCreatePeriodicVestingAccount => ({
        fromAddress: data.from_address,
        toAddress: data.to_address,
        startTime: BigInt(data.start_time),
        vestingPeriods: data.vesting_periods.map(({ length, amount }) => ({
          length: BigInt(length),
          amount,
        })),
      }), 
    },
  };
}

export const periodicVestingTypes: ReadonlyArray<[string, GeneratedType]> = [
  [MsgTypeUrls.CreatePeriodicVestingAccount, MsgCreatePeriodicVestingAccount]
];
