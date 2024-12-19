import { MsgCreatePeriodicVestingAccount } from "cosmjs-types/cosmos/vesting/v1beta1/tx";
import { useChains } from "../../../context/ChainsContext";
import { printableCoins } from "../../../lib/displayHelpers";
import HashView from "../HashView";
import { intervalToDuration, formatDuration } from "date-fns";
import StackableContainer from "@/components/layout/StackableContainer";

interface TxMsgCreatePeriodicVestingAccountDetailsProps {
  readonly msgValue: MsgCreatePeriodicVestingAccount;
}

const TxMsgCreatePeriodicVestingAccountDetails = ({
  msgValue,
}: TxMsgCreatePeriodicVestingAccountDetailsProps) => {
  const { chain } = useChains();

  const formatDate = (timestamp: bigint) => {
    const dateObj = new Date(Number(timestamp) * 1000);
    return {
      date: dateObj.toLocaleDateString("en-US"),
      time: dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    };
  };

  const formatSeconds = (seconds: bigint) => {
    const duration = intervalToDuration({ start: 0, end: Number(seconds) * 1000 });
    return formatDuration(duration, { delimiter: ", " });
  };

  const { date: startTimeDate, time: startTimeTime } = formatDate(msgValue.startTime);

  const vestingPeriods = msgValue.vestingPeriods.map((period, index) => {
    const periodDuration = formatSeconds(period.length);
    const periodAmount = printableCoins(period.amount, chain) || "None";
    return (
      <StackableContainer key={index} lessMargin lessPadding lessRadius>
        <div>
          <label>Period {index + 1}:</label>
          <p>Duration: {periodDuration}</p>
          <p>Amount: {periodAmount}</p>
        </div>
      </StackableContainer>
    );
  });

  return (
    <>
      <li>
        <h3>MsgCreatePeriodicVestingAccountDetails</h3>
      </li>
      <li>
        <label>Start Time:</label>
        <div title={String(msgValue.startTime)}>
          <p>
            {startTimeDate} {startTimeTime}
          </p>
        </div>
      </li>
      <li>
        <label>From:</label>
        <div title={msgValue.fromAddress}>
          <HashView hash={msgValue.fromAddress} />
        </div>
      </li>
      <li>
        <label>To:</label>
        <div title={msgValue.toAddress}>
          <HashView hash={msgValue.toAddress} />
        </div>
      </li>
      <li>
        <label>Vesting Periods:</label>
      </li>
      {vestingPeriods}
      <style jsx>{`
        li:not(:has(h3)) {
          background: rgba(255, 255, 255, 0.03);
          padding: 6px 10px;
          border-radius: 8px;
          display: flex;
          align-items: flex-start;
        }
        li + li:nth-child(2) {
          margin-top: 25px;
        }
        li + li {
          margin-top: 10px;
        }
        li div {
          padding: 3px 6px;
        }
        label {
          font-size: 12px;
          background: rgba(255, 255, 255, 0.1);
          padding: 3px 6px;
          border-radius: 5px;
          display: block;
        }
        ul {
          list-style-type: none;
          padding: 0;
          margin: 0;
        }
        ul li {
          margin-top: 5px;
        }
      `}</style>
    </>
  );
};

export default TxMsgCreatePeriodicVestingAccountDetails;
