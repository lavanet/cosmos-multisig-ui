import SelectProvider from "@/components/SelectProviderNext";
import { MsgDualRedelegateEncodeObject } from "@/types/lava";
import { useEffect, useState } from "react";
import { MsgGetter } from "..";
import { useChains } from "../../../../context/ChainsContext";
import { displayCoinToBaseCoin, baseCoinToDisplayCoin } from "../../../../lib/coinHelpers";
import { checkAddress, exampleAddress, trimStringsObj } from "../../../../lib/displayHelpers";
import { MsgCodecs, MsgTypeUrls } from "../../../../types/txMsg";
import Input from "../../../inputs/Input";
import StackableContainer from "../../../layout/StackableContainer";
import { EncodeObject } from "@cosmjs/proto-signing";

interface MsgDualRedelegateFormProps {
  readonly delegatorAddress: string;
  readonly setMsgGetter: (msgGetter: MsgGetter) => void;
  readonly deleteMsg: () => void;
  readonly msg: EncodeObject["value"];
}

const MsgDualRedelegateForm = ({
  delegatorAddress,
  setMsgGetter,
  deleteMsg,
  msg: msgProps,
}: MsgDualRedelegateFormProps) => {
  const { chain } = useChains();

  const [fromProviderAddress, setFromProviderAddress] = useState(msgProps?.fromProvider ?? "");
  const [toProviderAddress, setToProviderAddress] = useState(msgProps?.toProvider ?? "");
  const amountFromMsg = msgProps?.amount?.amount;
  const [amount, setAmount] = useState(
    amountFromMsg
      ? baseCoinToDisplayCoin(
          {
            amount: amountFromMsg,
            denom: msgProps?.amount?.denom,
          },
          chain.assets,
        ).amount
      : "0",
  );

  const [fromProviderAddressError, setFromProviderAddressError] = useState("");
  const [toProviderAddressError, setToProviderAddressError] = useState("");
  const [amountError, setAmountError] = useState("");

  const trimmedInputs = trimStringsObj({
    fromProviderAddress,
    toProviderAddress,
    amount,
  });

  useEffect(() => {
    // eslint-disable-next-line no-shadow
    const { fromProviderAddress, toProviderAddress, amount } = trimmedInputs;

    const isMsgValid = (): boolean => {
      setFromProviderAddressError("");
      setToProviderAddressError("");
      setAmountError("");

      if (!fromProviderAddress) {
        setFromProviderAddressError("From Provider address is required");
        return false;
      }

      if (!toProviderAddress) {
        setToProviderAddressError("To Provider address is required");
        return false;
      }

      const fromProviderAddressErrorMsg = checkAddress(fromProviderAddress, chain.addressPrefix);
      if (fromProviderAddressErrorMsg) {
        setFromProviderAddressError(
          `Invalid address for network ${chain.chainId}: ${fromProviderAddressErrorMsg}`,
        );
        return false;
      }

      const toProviderAddressErrorMsg = checkAddress(toProviderAddress, chain.addressPrefix);
      if (toProviderAddressErrorMsg) {
        setToProviderAddressError(
          `Invalid address for network ${chain.chainId}: ${toProviderAddressErrorMsg}`,
        );
        return false;
      }

      if (!amount || Number(amount) <= 0) {
        setAmountError("Amount must be greater than 0");
        return false;
      }

      try {
        displayCoinToBaseCoin({ denom: chain.displayDenom, amount }, chain.assets);
      } catch (e: unknown) {
        setAmountError(e instanceof Error ? e.message : "Could not set decimals");
        return false;
      }

      return true;
    };

    const microCoin = (() => {
      try {
        return displayCoinToBaseCoin({ denom: chain.displayDenom, amount }, chain.assets);
      } catch {
        return { denom: chain.displayDenom, amount: "0" };
      }
    })();

    const msgValue = MsgCodecs[MsgTypeUrls.DualRedelegate].fromPartial({
      creator: delegatorAddress,
      fromProvider: fromProviderAddress,
      toProvider: toProviderAddress,
      amount: microCoin,
    });

    const msg: MsgDualRedelegateEncodeObject = {
      typeUrl: MsgTypeUrls.DualRedelegate,
      value: msgValue,
    };

    setMsgGetter({ isMsgValid, msg });
  }, [
    chain.addressPrefix,
    chain.assets,
    chain.chainId,
    chain.displayDenom,
    delegatorAddress,
    setMsgGetter,
    trimmedInputs,
  ]);

  return (
    <StackableContainer lessPadding lessMargin>
      <button className="remove" onClick={() => deleteMsg()}>
        ✕
      </button>
      <h2>Dualstaking MsgRedelegate</h2>
      <div className="form-item">
        <SelectProvider
          key={fromProviderAddress}
          addEmptyProvider
          providerAddress={fromProviderAddress}
          setProviderAddress={setFromProviderAddress}
        />
        <Input
          label="From Provider Address"
          name="from-provider-address"
          value={fromProviderAddress}
          onChange={({ target }) => {
            setFromProviderAddress(target.value);
            setFromProviderAddressError("");
          }}
          error={fromProviderAddressError}
          placeholder={`E.g. ${exampleAddress(0, chain.addressPrefix)}`}
        />
      </div>
      <div className="form-item">
        <SelectProvider
          key={toProviderAddress}
          addEmptyProvider
          providerAddress={toProviderAddress}
          setProviderAddress={setToProviderAddress}
        />
        <Input
          label="To Provider Address"
          name="to-provider-address"
          value={toProviderAddress}
          onChange={({ target }) => {
            setToProviderAddress(target.value);
            setToProviderAddressError("");
          }}
          error={toProviderAddressError}
          placeholder={`E.g. ${exampleAddress(0, chain.addressPrefix)}`}
        />
      </div>
      <div className="form-item">
        <Input
          type="number"
          label={`Amount (${chain.displayDenom})`}
          name="amount"
          value={amount}
          onChange={({ target }) => {
            setAmount(target.value);
            setAmountError("");
          }}
          error={amountError}
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

export default MsgDualRedelegateForm;
