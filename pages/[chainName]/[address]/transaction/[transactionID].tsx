import { approvedTransaction, verifiedSignatures } from "../../../../lib/transactionIntegrity";
import { hasExec } from "../../../../lib/authz/messages";
import { preflightExec } from "../../../../lib/authz/preflight";
import { validateCancelUnbondingMessages } from "../../../../lib/cancelUnbonding";
import { isChainInfoFilled } from "@/context/ChainsContext/helpers";
import { toastError, toastSuccess } from "@/lib/utils";
import { MultisigThresholdPubkey } from "@cosmjs/amino";
import { TxRaw, AuthInfo } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { fromBase64, toBase64 } from "@cosmjs/encoding";
import { Account, StargateClient, makeMultisignedTxBytes } from "@cosmjs/stargate";
import { assert } from "@cosmjs/utils";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import CompletedTransaction from "../../../../components/dataViews/CompletedTransaction";
import ThresholdInfo from "../../../../components/dataViews/ThresholdInfo";
import TransactionInfo from "../../../../components/dataViews/TransactionInfo";
import TransactionSigning from "../../../../components/forms/TransactionSigning";
import Button from "../../../../components/inputs/Button";
import Page from "../../../../components/layout/Page";
import StackableContainer from "../../../../components/layout/StackableContainer";
import { useChains } from "../../../../context/ChainsContext";
import { findTransactionByID } from "../../../../lib/graphqlHelpers";
import { getMultisigAccount } from "../../../../lib/multisigHelpers";
import { requestJson } from "../../../../lib/request";
import { dbTxFromJson } from "../../../../lib/txMsgHelpers";
import { DbSignature } from "../../../../types";

interface Props {
  props: {
    transactionJSON: string;
    transactionID: string;
    txHash: string;
    signatures: DbSignature[];
  };
}

export const getServerSideProps: GetServerSideProps = async (context): Promise<Props> => {
  // get transaction info
  const transactionID = context.params?.transactionID?.toString();
  assert(transactionID, "Transaction ID missing");
  let transactionJSON;
  let txHash;
  let signatures;
  try {
    console.log("Function `findTransactionByID` invoked", transactionID);
    const getRes = await findTransactionByID(transactionID);
    console.log("success", getRes.data);
    txHash = getRes.data.getTransaction.txHash;
    transactionJSON = getRes.data.getTransaction.dataJSON;
    signatures = getRes.data.getTransaction.signatures;
  } catch (err: unknown) {
    console.log(err);
  }
  return {
    props: {
      transactionJSON,
      txHash,
      transactionID,
      signatures,
    },
  };
};

const TransactionPage = ({
  transactionJSON,
  transactionID,
  signatures,
  txHash,
}: {
  transactionJSON: string;
  transactionID: string;
  signatures: DbSignature[];
  txHash: string;
}) => {
  const { chain } = useChains();
  const [currentSignatures, setCurrentSignatures] = useState(signatures);
  const [validSignatures, setValidSignatures] = useState<DbSignature[]>([]);
  const [integrityError, setIntegrityError] = useState("");
  const [failedHash, setFailedHash] = useState("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [transactionHash, setTransactionHash] = useState("");
  const [hashNotice, setHashNotice] = useState("");
  const broadcasting = useRef(false);
  const [accountOnChain, setAccountOnChain] = useState<Account | null>(null);
  const [pubkey, setPubkey] = useState<MultisigThresholdPubkey>();
  const txInfo = dbTxFromJson(transactionJSON);
  const router = useRouter();
  const multisigAddress = router.query.address?.toString();

  const addSignature = (signature: DbSignature) => {
    setCurrentSignatures((prevState: DbSignature[]) => [...prevState, signature]);
  };

  useEffect(() => {
    (async function fetchMultisig() {
      try {
        if (!multisigAddress || !isChainInfoFilled(chain) || !chain.nodeAddress) {
          return;
        }

        const client = await StargateClient.connect(chain.nodeAddress);
        const result = await (async () => {
          try {
            return await getMultisigAccount(multisigAddress, chain.addressPrefix, client);
          } finally {
            client.disconnect();
          }
        })();

        setPubkey(result[0]);
        setAccountOnChain(result[1]);
      } catch (e) {
        console.error("Failed to find multisig address:", e);
        toastError({
          description: "Failed to find multisig address",
          fullError: e instanceof Error ? e : undefined,
        });
      }
    })();
  }, [chain, multisigAddress]);

  useEffect(() => {
    let active = true;
    setValidSignatures([]);
    setIntegrityError("");
    const tx = dbTxFromJson(transactionJSON);
    if (!pubkey || !tx || !multisigAddress || !chain.addressPrefix) return;
    if (tx.chainId !== chain.chainId) {
      setIntegrityError("Transaction belongs to a different chain");
      return;
    }
    verifiedSignatures(tx, pubkey, chain.addressPrefix, currentSignatures, multisigAddress)
      .then((valid) => {
        if (active) setValidSignatures(valid);
      })
      .catch((error) => {
        if (active) setIntegrityError(error.message);
      });
    return () => {
      active = false;
    };
  }, [
    transactionJSON,
    pubkey,
    currentSignatures,
    multisigAddress,
    chain.addressPrefix,
    chain.chainId,
  ]);

  // A database hash is only a hint. Confirm inclusion, success and the exact body on chain.
  useEffect(() => {
    let active = true;
    if (!txHash || !chain.nodeAddress || !pubkey || !multisigAddress) return;
    const tx = dbTxFromJson(transactionJSON);
    if (!tx || tx.chainId !== chain.chainId) return;
    setHashNotice("Checking saved transaction hash on chain…");
    (async () => {
      const client = await StargateClient.connect(chain.nodeAddress);
      try {
        if ((await client.getChainId()) !== tx.chainId) throw new Error("Wrong chain");
        const included = await client.getTx(txHash);
        if (!included) throw new Error("Saved transaction hash is not confirmed on this node");
        const raw = TxRaw.decode(included.tx);
        const info = AuthInfo.decode(raw.authInfoBytes);
        if (
          toBase64(raw.bodyBytes) !== toBase64(approvedTransaction(tx, multisigAddress).body) ||
          info.signerInfos.length !== 1 ||
          info.signerInfos[0].sequence.toString() !== tx.sequence.toString()
        ) {
          throw new Error("Saved transaction hash does not match this proposal");
        }
        if (active) {
          setHashNotice("");
          if (included.code === 0) setTransactionHash(txHash);
          else setFailedHash(txHash);
        }
      } finally {
        client.disconnect();
      }
    })().catch((e) => {
      if (active) setHashNotice(e.message);
    });
    return () => {
      active = false;
    };
  }, [txHash, transactionJSON, chain.nodeAddress, chain.chainId, pubkey, multisigAddress]);

  const broadcastTx = async () => {
    if (broadcasting.current) return;
    broadcasting.current = true;
    const loadingToastId = toast.loading("Broadcasting transaction");

    try {
      setIsBroadcasting(true);

      assert(accountOnChain, "Account on chain value missing.");
      assert(
        typeof accountOnChain.accountNumber === "number",
        "Account on chain is missing an accountNumber",
      );
      assert(pubkey, "Pubkey not found on chain or in database");
      assert(txInfo, "Transaction not found in database");
      assert(multisigAddress, "Multisig address missing");
      assert(txInfo.chainId === chain.chainId, "Transaction belongs to a different chain");
      const verified = await verifiedSignatures(
        txInfo,
        pubkey,
        chain.addressPrefix,
        currentSignatures,
        multisigAddress,
      );
      assert(
        verified.length >= Number(pubkey.value.threshold),
        "Not enough valid member signatures",
      );
      const bodyBytes = approvedTransaction(txInfo, multisigAddress).body;
      const signedTxBytes = makeMultisignedTxBytes(
        pubkey,
        txInfo.sequence,
        txInfo.fee,
        bodyBytes,
        new Map(verified.map((s) => [s.address, fromBase64(s.signature)])),
      );

      assert(multisigAddress, "Multisig address missing");
      await validateCancelUnbondingMessages(chain.nodeAddress, txInfo.msgs, multisigAddress);
      if (hasExec(txInfo.msgs)) {
        const used = await preflightExec(
          chain.nodeAddress,
          chain.addressPrefix,
          txInfo,
          pubkey,
          signedTxBytes,
        );
        if (used > Number(txInfo.fee.gas))
          {throw new Error("Gas limit is no longer sufficient. Create a new proposal.");}
      }
      const broadcaster = await StargateClient.connect(chain.nodeAddress);
      const result = await (async () => {
        try {
          const account = await broadcaster.getAccount(multisigAddress);
          assert(
            account?.sequence === txInfo.sequence && account.accountNumber === txInfo.accountNumber,
            "Multisig sequence changed. Create a new proposal.",
          );
          assert((await broadcaster.getChainId()) === txInfo.chainId, "Wrong chain");
          return await broadcaster.broadcastTx(signedTxBytes);
        } finally {
          broadcaster.disconnect();
        }
      })();
      if (result.code !== 0) {
        setFailedHash(result.transactionHash);
        throw new Error(
          `Transaction ${result.transactionHash} was included but failed (code ${result.code}): ${result.rawLog}. Fees and sequence may have been consumed. Create a new proposal.`,
        );
      }
      console.log(result);
      setTransactionHash(result.transactionHash);
      await requestJson(`/api/transaction/${transactionID}`, {
        body: { txHash: result.transactionHash },
      });
      toastSuccess("Transaction broadcasted with hash", result.transactionHash);
      setTransactionHash(result.transactionHash);
    } catch (e) {
      console.error("Failed to broadcast tx:", e);
      toastError({
        description: "Failed to broadcast tx",
        fullError: e instanceof Error ? e : undefined,
      });
    } finally {
      broadcasting.current = false;
      setIsBroadcasting(false);
      toast.dismiss(loadingToastId);
    }
  };

  const isThresholdMet = pubkey
    ? validSignatures.length >= Number(pubkey.value.threshold) && !integrityError && !failedHash
    : false;

  return (
    <Page
      goBack={
        chain.registryName
          ? {
              pathname: `/${chain.registryName}/${multisigAddress}`,
              title: "multisig",
            }
          : undefined
      }
    >
      <StackableContainer base>
        <StackableContainer>
          <h1>{transactionHash ? "Completed Transaction" : "In Progress Transaction"}</h1>
        </StackableContainer>
        {hashNotice && <p role="status">{hashNotice}</p>}
        {integrityError && <p role="alert">{integrityError}</p>}
        {failedHash && (
          <p role="alert">
            Execution failed: {failedHash}. Fees and sequence may have been consumed. Create a new
            proposal.
          </p>
        )}
        {currentSignatures.length > validSignatures.length && (
          <p>Only valid, distinct member signatures count toward approval.</p>
        )}
        {transactionHash ? <CompletedTransaction transactionHash={transactionHash} /> : null}
        {!transactionHash ? (
          <StackableContainer lessPadding lessMargin>
            {pubkey ? <ThresholdInfo signatures={validSignatures} pubkey={pubkey} /> : null}
            {isThresholdMet ? (
              <>
                <Button
                  label={isBroadcasting ? "Broadcasting..." : "Broadcast Transaction"}
                  onClick={broadcastTx}
                  primary
                  disabled={isBroadcasting}
                />
              </>
            ) : null}
            {pubkey && txInfo && !integrityError && !failedHash ? (
              <TransactionSigning
                tx={txInfo}
                transactionID={transactionID}
                pubkey={pubkey}
                signatures={validSignatures}
                addSignature={addSignature}
              />
            ) : null}
          </StackableContainer>
        ) : null}
        {txInfo ? <TransactionInfo tx={txInfo} /> : null}
      </StackableContainer>
    </Page>
  );
};

export default TransactionPage;
