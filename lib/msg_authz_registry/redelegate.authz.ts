import { IMsgBase, MsgBase } from "./base.authz";

import { MsgBeginRedelegate } from "cosmjs-types/cosmos/staking/v1beta1/tx";

export class Redelegate extends MsgBase implements IMsgBase {
    public typeUrl: string = "/cosmos.staking.v1beta1.MsgBeginRedelegate";
    public toBinary(): Uint8Array {
        return MsgBeginRedelegate.encode(MsgBeginRedelegate.fromPartial(this.value)).finish();
    }
}
