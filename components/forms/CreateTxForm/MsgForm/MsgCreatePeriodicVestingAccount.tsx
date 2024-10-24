import { EncodeObject } from "@cosmjs/proto-signing";
import { useEffect, useState } from "react";
import { MsgGetter } from "..";
import { useChains } from "../../../../context/ChainsContext";
import { displayCoinToBaseCoin } from "../../../../lib/coinHelpers";
import {
  datetimeLocalFromTimestamp,
  timestampFromDatetimeLocal,
} from "../../../../lib/dateHelpers";
import { checkAddress, exampleAddress, trimStringsObj } from "../../../../lib/displayHelpers";
import { MsgCodecs, MsgTypeUrls } from "../../../../types/txMsg";
import Input from "../../../inputs/Input";
import Select from "../../../inputs/Select";
import StackableContainer from "../../../layout/StackableContainer";
import { set } from "date-fns";

const UNNIT_VESTING_PERIODS = {
  MONTH: "month",
  DAYS: "days",
  SECONDS: "seconds",
};

interface PeriodicVestingPeriod {
  amount: string;
  length: string; // in seconds
  unit: typeof UNNIT_VESTING_PERIODS[keyof typeof UNNIT_VESTING_PERIODS];
}

interface MsgCreateVestingAccountFormProps {
  readonly fromAddress: string;
  readonly setMsgGetter: (msgGetter: MsgGetter) => void;
  readonly deleteMsg: () => void;
}

const MsgCreateVestingAccountForm = ({
  fromAddress,
  setMsgGetter,
  deleteMsg,
}: MsgCreateVestingAccountFormProps) => {
  const { chain } = useChains();

  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("0");
  const [startTime, setEndTime] = useState(
    datetimeLocalFromTimestamp(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default is one month from now
  );
  const [delayed, setDelayed] = useState(true);
  const [vestingPeriods, setVestingPeriods] = useState<PeriodicVestingPeriod[]>([
    { amount: "", length: "", unit: UNNIT_VESTING_PERIODS.SECONDS },
  ]);
  const [showRepeatState, setShowRepeatState] = useState(new Map<number, boolean>());
  const [repeatTimes, setRepeatTimes] = useState(1);

  const [toAddressError, setToAddressError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [startTimeError, setEndTimeError] = useState("");

  const trimmedInputs = trimStringsObj({ toAddress, amount, endTime: startTime });
  const updateShowRepeatState = (index: number, showRepeat: boolean) => {
    setShowRepeatState(map => new Map(map.set(index, showRepeat)));
  }

  const addVestingPeriod = ({amount = "", length = "", unit = UNNIT_VESTING_PERIODS.SECONDS}: PeriodicVestingPeriod) => {
    setVestingPeriods([...vestingPeriods, { amount, length, unit }]);
  };

  const repeatVestingPeriods = (times: number, period: PeriodicVestingPeriod ) => {
    const repeatedPeriods = [...vestingPeriods];
    for (let i = 0; i < times; i++) {
      repeatedPeriods.push({ amount: period.amount, length: period.length, unit: period.unit });
    }
    setVestingPeriods(repeatedPeriods);
  };

  const removeVestingPeriod = (index: number) => {
    const updatedPeriods = vestingPeriods.filter((_, i) => i !== index);
    setVestingPeriods(updatedPeriods);
  };

  const updateVestingPeriod = (index: number, field: keyof PeriodicVestingPeriod, value: string) => {
    const updatedPeriods = vestingPeriods.map((period, i) =>
      i === index ? { ...period, [field]: value } : period,
    );
    setVestingPeriods(updatedPeriods);
  };

  useEffect(() => {
    const { toAddress, amount, endTime } = trimmedInputs;

    const isMsgValid = (): boolean => {
      setToAddressError("");
      setAmountError("");
      setEndTimeError("");

      const addressErrorMsg = checkAddress(toAddress, chain.addressPrefix);
      if (addressErrorMsg) {
        setToAddressError(`Invalid address for network ${chain.chainId}: ${addressErrorMsg}`);
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

      const timeoutDate = new Date(Number(timestampFromDatetimeLocal(endTime, "ms")));
      if (timeoutDate <= new Date()) {
        setEndTimeError("End time must be a date in the future");
        return false;
      }

      return true;
    };

    const microCoin = (() => {
      try {
        if (!amount || amount === "0") {
          return null;
        }

        return displayCoinToBaseCoin({ denom: chain.displayDenom, amount }, chain.assets);
      } catch {
        return null;
      }
    })();

    const vestingPeriodsConverted = vestingPeriods.map((period) => ({
      amount: microCoin ? [{ denom: chain.displayDenom, amount: period.amount }] : [],
      length: BigInt(period.length), // Make sure it's in the correct format (seconds)
    }));

    const msgValue = MsgCodecs[MsgTypeUrls.CreatePeriodicVestingAccount].fromPartial({
      fromAddress,
      toAddress,
      startTime: timestampFromDatetimeLocal(endTime, "s"),
      vestingPeriods: vestingPeriodsConverted,
    });

    const msg: EncodeObject = { typeUrl: MsgTypeUrls.CreatePeriodicVestingAccount, value: msgValue };

    setMsgGetter({ isMsgValid, msg });
  }, [
    chain.addressPrefix,
    chain.assets,
    chain.chainId,
    chain.displayDenom,
    delayed,
    fromAddress,
    setMsgGetter,
    trimmedInputs,
    vestingPeriods,
  ]);

  return (
    <StackableContainer lessPadding lessMargin>
      <button className="remove" onClick={() => deleteMsg()}>
        ✕
      </button>
      <h2>MsgCreatePeriodicVestingAccount</h2>

      <div className="form-item">
        <Input
          label="Recipient Address"
          name="recipient-address"
          value={toAddress}
          onChange={({ target }) => {
            setToAddress(target.value);
            setToAddressError("");
          }}
          error={toAddressError}
          placeholder={`E.g. ${exampleAddress(0, chain.addressPrefix)}`}
        />
      </div>
      <div className="form-item">
        <Input
          type="datetime-local"
          label="Start time"
          name="end-time"
          value={startTime}
          onChange={({ target }) => {
            setEndTime(target.value);
            setEndTimeError("");
          }}
          error={startTimeError}
        />
      </div>

      {vestingPeriods.map((period, index) => (
        <StackableContainer lessMargin lessPadding lessRadius>
        <div key={index} className="form-item relative">
          <h3>Vesting Period {index + 1}</h3>
          <button className="remove" onClick={() => removeVestingPeriod(index)}>
            ✕
          </button>
          <div className="inline-form mt-5">
            <Input
              type="number"
              label={`Amount (${chain.displayDenom})`}
              name={`amount-${index}`}
              value={period.amount}
              onChange={({ target }) => updateVestingPeriod(index, "amount", target.value)}
              error={amountError}
            />
            <div className="flex items-center justify-between mt-5">
              <Input
                type="number"
                width={"79%"}
                label="Vesting Length"
                name={`length-${index}`}
                value={period.length}
                onChange={({ target }) => updateVestingPeriod(index, "length", target.value)}
                error={""}
              />
              <Select
                isSearchable={false}
                className="self-end w-1/5"
                options={[
                  { value: UNNIT_VESTING_PERIODS.SECONDS, label: UNNIT_VESTING_PERIODS.SECONDS },
                  { value: UNNIT_VESTING_PERIODS.DAYS, label: UNNIT_VESTING_PERIODS.DAYS },
                  { value: UNNIT_VESTING_PERIODS.MONTH, label: UNNIT_VESTING_PERIODS.MONTH },
                ]}
                value={{ value: period.unit, label: period.unit }}
                onChange={(target: any) => updateVestingPeriod(index, "unit", target.value)}
              />
            </div>
          </div>
        </div>
        {!showRepeatState.get(index) ? (
        <div className="button-group">
          <button type="button" className="add ml-1" onClick={() => addVestingPeriod(period)}>
            Repeat to end
          </button>
          <button type="button" className="add ml-1" onClick={() => updateShowRepeatState(index, true)}>
            Repeat N times
          </button>
        </div>
      ) : (
        <div className="repeat-n-times">
          <Input
            type="number"
            label="Number of repeats"
            name="repeat-times"
            value={repeatTimes.toString()}
            onChange={({ target }) => setRepeatTimes(Number(target.value))}
          />
          <div className="flex justify-between mt-3" >
            <button
              type="button"
              className="add mr-1 w-full"
              onClick={() => {
                repeatVestingPeriods(repeatTimes, period);
                setRepeatTimes(1);
                updateShowRepeatState(index, false);
              }}
            >
              Repeat
            </button>
            <button
              type="button"
              className="add ml-1 w-full"
              onClick={() => {
                updateShowRepeatState(index, false);
                setRepeatTimes(1);
              }}
            >
              Cancel
            </button>
          </div>

        </div>
      )}
        </StackableContainer>
      ))}
      <button type="button" className="add mr-1 mt-5 text-xl" onClick={addVestingPeriod}>
            +
      </button> 

      <style jsx>{`
        .form-item {
          margin-top: 1.5em;
        }
        button.add {
          background: rgba(255, 255, 255, 0.2);
          width: 100%;
          height: 30px;
          // font-size: 1em;
          border-radius: 9px;
          border: none;
          color: white;
        }
        .remove {
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
        .button-group {
          display: flex;
          justify-content: space-between;
          margin-top: 1.5em;
        }
        .repeat-n-times {
          // display: flex;
          // gap: 1em;
          margin-top: 1.5em;
        }
      `}</style>
    </StackableContainer>
  );
};

export default MsgCreateVestingAccountForm;
