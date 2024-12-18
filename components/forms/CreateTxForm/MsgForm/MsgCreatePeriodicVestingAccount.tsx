import { EncodeObject } from "@cosmjs/proto-signing";
import BigNumber from "bignumber.js";
import { useEffect, useState } from "react";
import { MsgGetter } from "..";
import { useChains } from "../../../../context/ChainsContext";
import { baseCoinToDisplayCoin, displayCoinToBaseCoin } from "../../../../lib/coinHelpers";
import {
  datetimeLocalFromTimestamp,
  timestampFromDatetimeLocal,
} from "../../../../lib/dateHelpers";
import { checkAddress, exampleAddress, trimStringsObj } from "../../../../lib/displayHelpers";
import { MsgCodecs, MsgTypeUrls } from "../../../../types/txMsg";
import Input from "../../../inputs/Input";
import Select from "../../../inputs/Select";
import StackableContainer from "../../../layout/StackableContainer";
import { add as addDate, differenceInSeconds } from "date-fns";

const UNIT_VESTING_PERIODS = {
  HOURS: "hours",
  DAYS: "days",
  SECONDS: "seconds",
};

interface PeriodicVestingPeriod {
  amount: string;
  length: string; // in seconds
  unit: (typeof UNIT_VESTING_PERIODS)[keyof typeof UNIT_VESTING_PERIODS];
}

interface MsgCreatePeriodicVestingAccountFormProps {
  readonly fromAddress: string;
  readonly setMsgGetter: (msgGetter: MsgGetter) => void;
  msg: EncodeObject["value"];
  readonly deleteMsg: () => void;
}

function totalAmount(vestingPeriods: PeriodicVestingPeriod[]): string {
  const amount = vestingPeriods
    .reduce((acc, period) => acc.plus(new BigNumber(period.amount)), new BigNumber(0))
    .toFormat();

  return amount !== "0" && amount !== "NaN" ? amount : "0";
}

function formatLengthVestingPeriod(length: string, unit: string): string {
  const start = new Date();
  switch (unit) {
    case UNIT_VESTING_PERIODS.DAYS: {
      const end = addDate(start, { days: Number(length) });
      return differenceInSeconds(end, start).toString();
    }
    case UNIT_VESTING_PERIODS.HOURS: {
      const end = addDate(start, { hours: Number(length) });
      return differenceInSeconds(end, start).toString();
    }
    default:
      return length;
  }
}
interface VestingPeriod {
  amount: {
    amount: string;
    denom: string;
  }[];
  length: number;
}
const MsgCreatePeriodicVestingAccount = ({
  fromAddress,
  setMsgGetter,
  deleteMsg,
  msg: msgProps,
}: MsgCreatePeriodicVestingAccountFormProps) => {
  const { chain } = useChains();

  const [toAddress, setToAddress] = useState(msgProps?.toAddress ?? "");
  const [startTime, setEndTime] = useState(
    msgProps?.startTime
      ? datetimeLocalFromTimestamp(BigInt(msgProps?.startTime), "s")
      : datetimeLocalFromTimestamp(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default is one month from now
  );
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const defaultVestingPeriods = msgProps?.vestingPeriods
    ? msgProps?.vestingPeriods?.map((period: VestingPeriod) => ({
        amount: baseCoinToDisplayCoin(
          { amount: period.amount[0].amount, denom: period.amount[0].denom },
          chain.assets,
        ).amount,
        length: period.length,
        unit: UNIT_VESTING_PERIODS.SECONDS,
      }))
    : [{ amount: "", length: "", unit: UNIT_VESTING_PERIODS.SECONDS }];
  const [vestingPeriods, setVestingPeriods] =
    useState<PeriodicVestingPeriod[]>(defaultVestingPeriods);
  const [showRepeatState, setShowRepeatState] = useState(new Map<number, boolean>());
  const [repeatTimes, setRepeatTimes] = useState(1);

  const [toAddressError, setToAddressError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [startTimeError, setEndTimeError] = useState("");

  const trimmedInputs = trimStringsObj({ toAddress, startTime });
  const updateShowRepeatState = (index: number, showRepeat: boolean) => {
    setShowRepeatState((map) => new Map(map.set(index, showRepeat)));
  };

  const addVestingPeriod = (period: Partial<PeriodicVestingPeriod> = {}) => {
    const { amount = "", length = "", unit = UNIT_VESTING_PERIODS.SECONDS } = period;
    setVestingPeriods([...vestingPeriods, { amount, length, unit }]);
  };

  const repeatVestingPeriods = (times: number, period: PeriodicVestingPeriod) => {
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

  const updateVestingPeriod = (
    index: number,
    field: keyof PeriodicVestingPeriod,
    value: string,
  ) => {
    const updatedPeriods = vestingPeriods.map((period, i) =>
      i === index ? { ...period, [field]: value } : period,
    );
    setVestingPeriods(updatedPeriods);
  };

  useEffect(() => {
    const { toAddress: trimmedToAddress, startTime: trimmedStartTime } = trimmedInputs;

    const isMsgValid = (): boolean => {
      setToAddressError("");
      setAmountError("");
      setEndTimeError("");

      const addressErrorMsg = checkAddress(trimmedToAddress, chain.addressPrefix);
      if (addressErrorMsg) {
        setToAddressError(`Invalid address for network ${chain.chainId}: ${addressErrorMsg}`);
        return false;
      }

      try {
        vestingPeriods.forEach((period) => {
          displayCoinToBaseCoin({ denom: chain.displayDenom, amount: period.amount }, chain.assets);
        });
      } catch (e: unknown) {
        setAmountError(e instanceof Error ? e.message : "Could not set decimals");
        return false;
      }
      // validate vesting length
      if (
        vestingPeriods.length === 0 ||
        vestingPeriods.some(
          (period) =>
            period.length.trim() === "" ||
            Number(period.length) <= 0 ||
            !Number.isInteger(Number(period.length)),
        )
      ) {
        setEndTimeError("Vesting length must be specified and must be a positive number");
        return false;
      }

      const timeoutDate = new Date(Number(timestampFromDatetimeLocal(trimmedStartTime, "ms")));
      if (timeoutDate <= new Date()) {
        setEndTimeError("End time must be a date in the future");
        return false;
      }

      return true;
    };

    const convertToMicro = (amount?: string) => {
      try {
        if (!amount || amount === "0") {
          return null;
        }
        return displayCoinToBaseCoin({ denom: chain.displayDenom, amount }, chain.assets);
      } catch {
        return null;
      }
    };

    const vestingPeriodsConverted = vestingPeriods.map((period) => {
      const convertedAmount = convertToMicro(period.amount);
      return {
        amount: convertedAmount ? [{ ...convertedAmount }] : [],
        length: BigInt(formatLengthVestingPeriod(period.length, period.unit)), // Ensure it's in seconds
      };
    });

    const msgValue = MsgCodecs[MsgTypeUrls.CreatePeriodicVestingAccount].fromPartial({
      fromAddress,
      toAddress: trimmedToAddress,
      startTime: timestampFromDatetimeLocal(trimmedStartTime, "s"),
      vestingPeriods: vestingPeriodsConverted,
    });

    const msg: EncodeObject = {
      typeUrl: MsgTypeUrls.CreatePeriodicVestingAccount,
      value: msgValue,
    };

    setMsgGetter({ isMsgValid, msg });
  }, [
    chain.addressPrefix,
    chain.assets,
    chain.chainId,
    chain.displayDenom,
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
      <div className="form-item">
        <label className="total-amount-label">Total Amount:</label>
        <div className="total-amount-value">
          {totalAmount(vestingPeriods)} {chain.displayDenom}
        </div>
      </div>

      {vestingPeriods.map((period, index) => (
        <StackableContainer key={index} lessMargin lessPadding lessRadius>
          <div className="form-item relative">
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
              <div className="mt-5 flex items-center justify-between">
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
                  className="w-1/5 self-end"
                  options={[
                    { value: UNIT_VESTING_PERIODS.SECONDS, label: UNIT_VESTING_PERIODS.SECONDS },
                    { value: UNIT_VESTING_PERIODS.HOURS, label: UNIT_VESTING_PERIODS.HOURS },
                    { value: UNIT_VESTING_PERIODS.DAYS, label: UNIT_VESTING_PERIODS.DAYS },
                  ]}
                  value={{ value: period.unit, label: period.unit }}
                  onChange={(target: { value: string }) =>
                    updateVestingPeriod(index, "unit", target.value)
                  }
                />
              </div>
            </div>
          </div>
          {!showRepeatState.get(index) ? (
            <div className="button-group">
              <button type="button" className="add ml-1" onClick={() => addVestingPeriod(period)}>
                Repeat to end
              </button>
              <button
                type="button"
                className="add ml-1"
                onClick={() => updateShowRepeatState(index, true)}
              >
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
              <div className="mt-3 flex justify-between">
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
      <button type="button" className="add mr-1 mt-5 text-xl" onClick={() => addVestingPeriod()}>
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
          margin-top: 1.5em;
        }
        .total-amount-label {
          font-weight: bold;
          margin-bottom: 0.5em;
          display: block;
        }
        .total-amount-value {
          background: rgba(255, 255, 255, 0.1);
          padding: 0.5em;
          border-radius: 5px;
          text-align: center;
          font-size: 1.2em;
          color: #fff;
        }
      `}</style>
    </StackableContainer>
  );
};

export default MsgCreatePeriodicVestingAccount;
