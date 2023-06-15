import { MsgWithdrawDelegatorRewardEncodeObject } from "@cosmjs/stargate";
import { assert } from "@cosmjs/utils";
import { useEffect, useState } from "react";
import { MsgGetter } from "..";
import { useAppContext } from "../../../../context/AppContext";
import { checkAddress, exampleAddress } from "../../../../lib/displayHelpers";
import { MsgCodecs, MsgTypeUrls } from "../../../../types/txMsg";
import Input from "../../../inputs/Input";
import StackableContainer from "../../../layout/StackableContainer";

interface MsgClaimRewardsFormProps {
  readonly delegatorAddress: string;
  readonly setMsgGetter: (msgGetter: MsgGetter) => void;
  readonly deleteMsg: () => void;
}

const MsgClaimRewardsForm = ({
  delegatorAddress,
  setMsgGetter,
  deleteMsg,
}: MsgClaimRewardsFormProps) => {
  const { state } = useAppContext();
  assert(state.chain.addressPrefix, "addressPrefix missing");

  const [validatorAddress, setValidatorAddress] = useState("");
  const [validatorAddressError, setValidatorAddressError] = useState("");

  useEffect(() => {
    try {
      setValidatorAddressError("");

      const isMsgValid = (): boolean => {
        assert(state.chain.addressPrefix, "addressPrefix missing");

        const addressErrorMsg = checkAddress(validatorAddress, state.chain.addressPrefix);
        if (addressErrorMsg) {
          setValidatorAddressError(
            `Invalid address for network ${state.chain.chainId}: ${addressErrorMsg}`,
          );
          return false;
        }

        return true;
      };

      const msgValue = MsgCodecs[MsgTypeUrls.WithdrawDelegatorReward].fromPartial({
        delegatorAddress,
        validatorAddress,
      });

      const msg: MsgWithdrawDelegatorRewardEncodeObject = {
        typeUrl: MsgTypeUrls.WithdrawDelegatorReward,
        value: msgValue,
      };

      setMsgGetter({ isMsgValid, msg });
    } catch {}
  }, [
    delegatorAddress,
    setMsgGetter,
    state.chain.addressPrefix,
    state.chain.chainId,
    validatorAddress,
  ]);

  return (
    <StackableContainer lessPadding lessMargin>
      <button className="remove" onClick={() => deleteMsg()}>
        ✕
      </button>
      <h2>MsgWithdrawDelegatorReward</h2>
      <div className="form-item">
        <Input
          label="Validator Address"
          name="validator-address"
          value={validatorAddress}
          onChange={({ target }) => setValidatorAddress(target.value)}
          error={validatorAddressError}
          placeholder={`E.g. ${exampleAddress(0, state.chain.addressPrefix)}`}
        />
      </div>
      <style jsx>{`
        .form-item {
          margin-top: 1.5em;
        }
        button.remove {
          background: rgba(255, 255, 255, 0.2);
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: none;
          color: white;
          position: absolute;
          right: 10px;
          top: 10px;
        }
      `}</style>
    </StackableContainer>
  );
};

export default MsgClaimRewardsForm;