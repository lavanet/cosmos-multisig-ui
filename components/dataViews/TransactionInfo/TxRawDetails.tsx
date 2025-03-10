import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import { useChains } from "../../../context/ChainsContext";
import { printableCoins } from "../../../lib/displayHelpers";
import HashView from "../HashView";

interface TxMsgGrantDetailsProps {
  readonly msgValue: MsgSend;
  readonly label: string;
}

const txRawDetails = ({ msgValue, label }: TxMsgGrantDetailsProps) => {
  const { chain } = useChains();

  return (
    <>
      <li>
        <h3>{label}</h3>
      </li>
      <li>
        <div className="jsonContainer">
            <pre>{JSON.stringify(msgValue, null, 2)}</pre>
        </div>
      </li>
      
      <style jsx>{`
        li:not(:has(h3)) {
          background: rgba(255, 255, 255, 0.03);
          padding: 6px 10px;
          border-radius: 8px;
          display: flex;
          align-items: center;
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
        pre {
          background: black;
          color: #fff; /* ensure text is visible on black background */
          padding: 1rem;
          border-radius: 4px;
          overflow: auto;
          white-space: pre; /* ensure the JSON is formatted properly */
        }
      `}</style>
    </>
  );
};

export default txRawDetails;
