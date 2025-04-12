import { IMsgBase, MsgBase } from "./base.authz";

import { MsgWithdrawDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/tx";

export class WithdrawDelegatorReward extends MsgBase implements IMsgBase {
    public typeUrl: string = "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward";
    public toBinary(): Uint8Array {
        return MsgWithdrawDelegatorReward.encode(MsgWithdrawDelegatorReward.fromPartial(this.value)).finish();
    }
}
