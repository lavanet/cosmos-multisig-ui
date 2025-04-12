import { IMsgBase, MsgBase } from "./base.authz";

import { MsgDelegate } from "cosmjs-types/cosmos/staking/v1beta1/tx";

export class Delegate extends MsgBase implements IMsgBase {
    public typeUrl: string = "/cosmos.staking.v1beta1.MsgDelegate";
    public toBinary(): Uint8Array {
        return MsgDelegate.encode(MsgDelegate.fromPartial(this.value)).finish();
    }
}
