import { toastError } from "@/lib/utils";
import { StargateClient } from "@cosmjs/stargate";
import { NextRouter, withRouter } from "next/router";
import { useState } from "react";
import { useChains } from "../../context/ChainsContext";
import { exampleAddress, examplePubkey } from "../../lib/displayHelpers";
import { createMultisigFromCompressedSecp256k1Pubkeys } from "../../lib/multisigHelpers";
import Button from "../inputs/Button";
import Input from "../inputs/Input";
import ThresholdInput from "../inputs/ThresholdInput";
import StackableContainer from "../layout/StackableContainer";

const emptyPubKeyGroup = () => {
  return { address: "", compressedPubkey: "", keyError: "", isPubkey: false };
};

interface Props {
  router: NextRouter;
}

const MultiSigForm = (props: Props) => {
  const { chain } = useChains();
  const [pubkeys, setPubkeys] = useState([emptyPubKeyGroup(), emptyPubKeyGroup()]);
  const [threshold, setThreshold] = useState(2);
  const [processing, setProcessing] = useState(false);

  const handleChangeThreshold = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newThreshold = parseInt(e.target.value, 10);
    if (newThreshold > pubkeys.length || newThreshold <= 0) {
      newThreshold = threshold;
    }
    setThreshold(newThreshold);
  };

  const handleKeyGroupChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const tempPubkeys = [...pubkeys];
    if (e.target.name === "compressedPubkey") {
      tempPubkeys[index].compressedPubkey = e.target.value;
    } else if (e.target.name === "address") {
      tempPubkeys[index].address = e.target.value;
    }
    setPubkeys(tempPubkeys);
  };

  const handleAddKey = () => {
    const tempPubkeys = [...pubkeys];
    setPubkeys(tempPubkeys.concat(emptyPubKeyGroup()));
  };

  const handleRemove = (index: number) => {
    const tempPubkeys = [...pubkeys];
    const oldLength = tempPubkeys.length;
    tempPubkeys.splice(index, 1);
    const newThreshold = threshold > tempPubkeys.length ? tempPubkeys.length : oldLength;
    setPubkeys(tempPubkeys);
    setThreshold(newThreshold);
  };

  const getPubkeyFromNode = async (address: string) => {
    const client = await StargateClient.connect(chain.nodeAddress);
    const accountOnChain = await client.getAccount(address);
    if (!accountOnChain || !accountOnChain.pubkey) {
      throw new Error(
        "Account has no pubkey on chain, this address will need to send a transaction to appear on chain.",
      );
    }
    return accountOnChain.pubkey.value;
  };

  const handleKeyBlur = async (index: number, { target }: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const tempPubkeys = [...pubkeys];
      let pubkey;
      // use pubkey
      console.log(tempPubkeys[index]);
      if (tempPubkeys[index].isPubkey) {
        pubkey = target.value;
        if (pubkey.length !== 44) {
          throw new Error("Invalid Secp256k1 pubkey");
        }
      } else {
        // use address to fetch pubkey
        const address = target.value;
        if (address.length > 0) {
          pubkey = await getPubkeyFromNode(address);
        }
      }

      tempPubkeys[index].compressedPubkey = pubkey;
      tempPubkeys[index].keyError = "";
      setPubkeys(tempPubkeys);
    } catch (e) {
      console.error("Invalid address or pubkey", e);
      const tempPubkeys = [...pubkeys];
      tempPubkeys[index].keyError = e instanceof Error ? e.message : "Invalid address or pubkey";
      setPubkeys(tempPubkeys);
    }
  };

  const handleCreate = async () => {
    setProcessing(true);
    const compressedPubkeys = pubkeys.map((item) => item.compressedPubkey);
    let multisigAddress;
    try {
      multisigAddress = await createMultisigFromCompressedSecp256k1Pubkeys(
        compressedPubkeys,
        threshold,
        chain.addressPrefix,
        chain.chainId,
      );
      props.router.push(`/${chain.registryName}/${multisigAddress}`);
    } catch (e) {
      console.error("Failed to create multisig:", e);
      toastError({
        description: "Failed to create multisig",
        fullError: e instanceof Error ? e : undefined,
      });
    }
  };

  const togglePubkey = (index: number) => {
    const tempPubkeys = [...pubkeys];
    tempPubkeys[index].isPubkey = !tempPubkeys[index].isPubkey;
    setPubkeys(tempPubkeys);
  };

  return (
    <>
      <StackableContainer>
        <StackableContainer lessPadding>
          <p>Add the addresses that will make up this multisig.</p>
        </StackableContainer>
        {pubkeys.map((pubkeyGroup, index) => {
          return (
            <StackableContainer lessPadding lessMargin key={index}>
              <div className="key-row">
                {pubkeys.length > 2 && (
                  <button
                    className="remove"
                    onClick={() => {
                      handleRemove(index);
                    }}
                  >
                    ✕
                  </button>
                )}
                <div className="key-inputs">
                  <Input
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      handleKeyGroupChange(index, e);
                    }}
                    value={
                      pubkeyGroup.isPubkey ? pubkeyGroup.compressedPubkey : pubkeyGroup.address
                    }
                    label={pubkeyGroup.isPubkey ? "Public Key (Secp256k1)" : "Address"}
                    name={pubkeyGroup.isPubkey ? "compressedPubkey" : "address"}
                    width="100%"
                    placeholder={`E.g. ${
                      pubkeyGroup.isPubkey
                        ? examplePubkey(index)
                        : exampleAddress(index, chain.addressPrefix)
                    }`}
                    error={pubkeyGroup.keyError}
                    onBlur={(e: React.ChangeEvent<HTMLInputElement>) => {
                      handleKeyBlur(index, e);
                    }}
                  />
                  <button className="toggle-type" onClick={() => togglePubkey(index)}>
                    Use {pubkeyGroup.isPubkey ? "Address" : "Public Key"}
                  </button>
                </div>
              </div>
            </StackableContainer>
          );
        })}

        <Button label="Add another address" onClick={() => handleAddKey()} />
      </StackableContainer>
      <StackableContainer>
        <StackableContainer lessPadding>
          <ThresholdInput
            onChange={handleChangeThreshold}
            value={threshold}
            total={pubkeys.length}
          />
        </StackableContainer>

        <StackableContainer lessPadding lessMargin>
          <p>
            This means that each transaction this multisig makes will require {threshold} of the
            members to sign it for it to be accepted by the validators.
          </p>
        </StackableContainer>
      </StackableContainer>
      <Button primary onClick={handleCreate} label="Create Multisig" loading={processing} />
      <style jsx>{`
        .key-inputs {
          display: flex;
          flex-direction: column;
          align-items: end;
          justify-content: space-between;
          max-width: 350px;
        }
        .error {
          color: coral;
          font-size: 0.8em;
          text-align: left;
          margin: 0.5em 0;
        }
        .key-row {
          position: relative;
        }
        button.remove {
          background: rgba(255, 255, 255, 0.2);
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: none;
          color: white;
          position: absolute;
          right: -23px;
          top: -22px;
        }
        p {
          margin-top: 1em;
        }
        p:first-child {
          margin-top: 0;
        }
        .toggle-type {
          margin-top: 10px;
          font-size: 12px;
          font-style: italic;
          border: none;
          background: none;
          color: white;
          text-decoration: underline;
        }
      `}</style>
    </>
  );
};

export default withRouter(MultiSigForm);
