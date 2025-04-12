import { IMsgBase, MsgBase } from "./base.authz";

import { MsgExec } from "cosmjs-types/cosmos/authz/v1beta1/tx";

export class Exec extends MsgBase implements IMsgBase {
    public typeUrl: string = "/cosmos.authz.v1beta1.MsgExec";
    public toBinary(): Uint8Array {
        return MsgExec.encode(MsgExec.fromPartial({
            ...this.value,
            msgs: this.value.msgs.map((msg: any) => msg.toProto()),
        })).finish();
    }
    public toAmino(): { type: string; value: any; } {
        return {
            type: "cosmos-sdk/MsgExec",
            value: {
                grantee: this.value.grantee,
                msgs: this.value.msgs.map((msg: any) => msg.toAmino()),
            },
        };
    }
}
