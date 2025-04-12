import { IMsgBase, MsgBase } from "./base.authz";

import { MsgDualClaimRewards } from "@/types/lava";

export class DualClaimRewards extends MsgBase implements IMsgBase {
    public typeUrl: string = "/lavanet.lava.dualstaking.MsgClaimRewards";
    public toBinary(): Uint8Array {
        return MsgDualClaimRewards.encode(MsgDualClaimRewards.fromPartial(this.value)).finish();
    }
}
