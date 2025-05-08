import { IMsgBase, MsgBase } from "./base.authz";

import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";

export class Send extends MsgBase implements IMsgBase {
  public typeUrl: string = "/cosmos.bank.v1beta1.MsgSend";
  public toBinary(): Uint8Array {
    return MsgSend.encode(MsgSend.fromPartial(this.value)).finish();
  }
}
