import { Send } from "./send.authz";
import { Exec } from "./exec.authz";
import { Dualredelegate } from "./dualredelegate.authz";
import { Dualdelegate } from "./dualdelegate.authz";
import { Delegate } from "./delegate.authz";
import { DualClaimRewards } from "./dualClaimRewards.authz";
import { Undelegate } from "./undelegate.authz";
import { WithdrawDelegatorReward } from "./withdrawDelegator.authz";
import { DualUnbond } from "./dualunbond.authz";
import { Redelegate } from "./redelegate.authz";
import { IMsgBase } from "@/lib/msg_authz_registry/base.authz";
import { MsgBase } from "@/lib/msg_authz_registry/base.authz";

const authzRegistry = new Map<string, typeof MsgBase>([
  ["/cosmos.authz.v1beta1.MsgExec", Exec],
  ["/cosmos.bank.v1beta1.MsgSend", Send],
  ["/cosmos.staking.v1beta1.MsgDelegate", Delegate],
  ["/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward", WithdrawDelegatorReward],
  ["/cosmos.staking.v1beta1.MsgBeginRedelegate", Redelegate],
  ["/lavanet.lava.dualstaking.MsgRedelegate", Dualredelegate],
  ["/lavanet.lava.dualstaking.MsgDelegate", Dualdelegate],
  ["/lavanet.lava.dualstaking.MsgClaimRewards", DualClaimRewards],
  ["/cosmos.staking.v1beta1.MsgUndelegate", Undelegate],
  ["/lavanet.lava.dualstaking.MsgUnbond", DualUnbond],
]);

type MsgType = {
  typeUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
};

export const createMsgAuthz = (msgs: MsgType[]): IMsgBase[] => {
  const msg = msgs.map((m) => {
    if (m.typeUrl !== "/cosmos.authz.v1beta1.MsgExec") {
      throw new Error(`msg type is not authz exect: ${m.typeUrl}`);
    }
    const innerMsgs = m.value.msgs.map((innerMsg: { typeUrl: string; value: unknown }) => {
      const Msg = authzRegistry.get(innerMsg.typeUrl);
      if (!Msg) {
        throw new Error(`No message found for type URL: ${innerMsg.typeUrl}`);
      }
      return new Msg(innerMsg.value);
    });

    const Msg = authzRegistry.get(m.typeUrl);
    if (!Msg) {
      throw new Error(`No message found for type URL: ${m.typeUrl}`);
    }

    return new Msg({
      grantee: m.value.grantee,
      msgs: innerMsgs,
    });
  });
  return msg;
};
