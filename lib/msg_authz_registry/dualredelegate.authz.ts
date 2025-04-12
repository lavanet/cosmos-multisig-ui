import { IMsgBase, MsgBase } from "./base.authz";

import { MsgDualRedelegate } from "@/types/lava";

export class Dualredelegate extends MsgBase implements IMsgBase {
    public typeUrl: string = "/lavanet.lava.dualstaking.MsgRedelegate";
    public toBinary(): Uint8Array {
        return MsgDualRedelegate.encode(MsgDualRedelegate.fromPartial(this.value)).finish();
    }
    public toAmino()  {
         return {
            type: "dualstaking/Redelegate",
            value: {
                creator: this.value.creator,
                from_chainID: undefined,
                from_provider: this.value.fromProvider,
                to_chainID: undefined,
                to_provider: this.value.toProvider,
                amount: this.value.amount,

            }
         }
    }
    
}
