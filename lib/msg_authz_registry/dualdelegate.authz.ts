import { IMsgBase, MsgBase } from "./base.authz";

import { MsgDualDelegate } from "@/types/lava";

export class Dualdelegate extends MsgBase implements IMsgBase {
  public typeUrl: string = "/lavanet.lava.dualstaking.MsgDelegate";
  public toBinary(): Uint8Array {
    return MsgDualDelegate.encode(MsgDualDelegate.fromPartial(this.value)).finish();
  }
}
