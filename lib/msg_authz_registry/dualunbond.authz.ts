import { IMsgBase, MsgBase } from "./base.authz";

import { MsgDualUnbond } from "@/types/lava";

export class DualUnbond extends MsgBase implements IMsgBase {
    public typeUrl: string = "/lavanet.lava.dualstaking.MsgUnbond";
    public toBinary(): Uint8Array {
        return MsgDualUnbond.encode(MsgDualUnbond.fromPartial(this.value)).finish();
    }
}
