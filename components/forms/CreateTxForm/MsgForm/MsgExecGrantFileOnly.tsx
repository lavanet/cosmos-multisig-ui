import { normalizeExec, EXEC } from "../../../../lib/authz/messages";
import { useState } from "react";
import { useEffect } from "react";
import { MsgGetter } from "..";
import { useChains } from "../../../../context/ChainsContext";
import { EncodeObject } from "@cosmjs/proto-signing";
import StackableContainer from "../../../layout/StackableContainer";
import { MsgTypeUrls } from "../../../../types/txMsg";

interface MsgSendFormProps {
  readonly fromAddress: string;
  readonly setMsgGetter: (msgGetter: MsgGetter) => void;
  readonly msg: EncodeObject["value"];
  readonly deleteMsg: () => void;
}

const MsgGrant = ({ fromAddress, setMsgGetter, deleteMsg, msg: msgProps }: MsgSendFormProps) => {
  const { chain } = useChains();
  const [error, setError] = useState("");

  useEffect(() => {
    setMsgGetter({
      isMsgValid: () => {
        try {
          normalizeExec({ typeUrl: EXEC, value: msgProps }, fromAddress);
          setError("");
          return true;
        } catch (e) {
          setError(e instanceof Error ? e.message : "Invalid execution");
          return false;
        }
      },
      msg: { typeUrl: MsgTypeUrls.MsgExecGrant, value: msgProps },
    });
  }, [chain.addressPrefix, chain.assets, chain.chainId, fromAddress, setMsgGetter, msgProps]);

  return (
    <StackableContainer lessPadding lessMargin>
      <button className="remove" onClick={() => deleteMsg()}>
        ✕
      </button>
      <h2>Imported authz execution</h2>
      {error && <p role="alert">{error}</p>}

      <div className="jsonContainer">
        <pre>
          {JSON.stringify(msgProps, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)}
        </pre>
      </div>

      <style jsx>{`
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
          cursor: pointer;
        }

        .jsonContainer {
          position: relative;
          margin-top: 1rem;
        }

        /* Flex container for the button so it is on the right */
        .copyButtonContainer {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 0.5rem;
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
    </StackableContainer>
  );
};

export default MsgGrant;
