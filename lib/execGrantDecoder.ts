import { MsgTypeUrls } from "@/types/txMsg";
import { MsgExec } from 'cosmjs-types/cosmos/authz/v1beta1/tx';
import { AminoConverter, AminoTypes } from '@cosmjs/stargate';
import { GeneratedType } from "@cosmjs/proto-signing";
import { MsgDelegate } from "cosmjs-types/cosmos/staking/v1beta1/tx";
import { toBase64 } from "@cosmjs/encoding";





export function createAuthzExecAminoConverters(aminoTypes: AminoTypes): Record<string, AminoConverter> {
  return {
    "/cosmos.authz.v1beta1.MsgExec": {
      aminoType: "cosmos-sdk/MsgExec",
      toAmino: (_data: MsgExec) => {
        // // Hardcoded values for debugging
        // const encodedValue = MsgDelegate.encode({
        //     delegatorAddress: "lava@1e3yksvnp3wwqja79w7527k3th4yjyapmvp706e",
        //     validatorAddress: "lava@valoper1e35nhndvsw8wes9hq49ckpyzmwhswq40sklx20",
        //     amount: {
        //         denom: "ulava",
        //         amount: "1"
        //     }
        //     }).finish();
        // console.log('dat===>', _data);
        // const aminoMsgs = _data.msgs.map((msg) => {
        //   const typeUrl = msg.typeUrl;
        //   return  aminoTypes.toAmino({typeUrl, value: msg.value});
        // });
        // console.log("aminoMsgs", aminoMsgs);
        // console.log('string', JSON.stringify(aminoMsgs, null, 2));

        return {
          grantee: _data.grantee,
          msgs: [
            {
              "type": "cosmos-sdk/Send",
              "value": {
                "from_address": "lava@1e3yksvnp3wwqja79w7527k3th4yjyapmvp706e",
                "to_address": "lava@1lws6rcrcdtxadc6c2j70sezwjwuzq6apq89ex6",
                "amount": [
                  {
                    "denom": "ulava",
                    "amount": "1"
                  }
                ]
              }
            }
          ]
        };
      },
      fromAmino: (_data: any): MsgExec => {
        // const msgs = _data.msgs.map((msg: any) => {
        //   const type = msg.type;
        //   return aminoTypes.fromAmino({type, value: msg.value});
        // });
        // console.log("fromAmino msgs", msgs);  
        // Hardcoded values for debugging
        console.log('fromAmino data:', _data);
        console.log('return', MsgExec.fromPartial({
          grantee: _data.grantee,
          msgs: [
            {
              "typeUrl": "/cosmos.bank.v1beta1.MsgSend",
              "value": {
                "fromAddress": "lava@1e3yksvnp3wwqja79w7527k3th4yjyapmvp706e",
                "toAddress": "lava@1lws6rcrcdtxadc6c2j70sezwjwuzq6apq89ex6",
                "amount": [
                  {
                    "denom": "ulava",
                    "amount": "1"
                  }
                ]
              }
            }
          ]
        }));
        
        return MsgExec.fromPartial({
          grantee: _data.grantee,
          msgs: [
            {
              "typeUrl": "/cosmos.bank.v1beta1.MsgSend",
              "value": {
                "from_address": "lava@1e3yksvnp3wwqja79w7527k3th4yjyapmvp706e",
                "to_address": "lava@1lws6rcrcdtxadc6c2j70sezwjwuzq6apq89ex6",
                "amount": [
                  {
                    "denom": "ulava",
                    "amount": "1"
                  }
                ]
              }
            }
          ]
        });
      }
    }
  };
}


export const execGrantTypes: ReadonlyArray<[string, GeneratedType]> = [
    [MsgTypeUrls.MsgExecGrant, MsgExec],
];
