import { IMsgBase, MsgBase } from "./base.authz";

import { MsgUndelegate } from "cosmjs-types/cosmos/staking/v1beta1/tx";

export class Undelegate extends MsgBase implements IMsgBase {
  public typeUrl: string = "/cosmos.staking.v1beta1.MsgUndelegate";
  public toBinary(): Uint8Array {
    return MsgUndelegate.encode(MsgUndelegate.fromPartial(this.value)).finish();
  }
}
