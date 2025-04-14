import { IMsgBase } from "./msg_authz_registry/base.authz";
import { SignerData } from "@cosmjs/stargate";
import { OfflineAminoSigner, encodeSecp256k1Pubkey, StdFee } from "@cosmjs/amino";
import { makeSignDoc as makeAminoSignDoc } from "@cosmjs/amino";
import { encodePubkey, makeAuthInfoBytes } from "@cosmjs/proto-signing";
import { TxBody } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { Int53 } from "@cosmjs/math";
import { SignMode } from "cosmjs-types/cosmos/tx/signing/v1beta1/signing";
import { fromBase64 } from "@cosmjs/encoding";

const makeBodyBytes = (
  messages: IMsgBase[],
  memo: string,
  timeoutHeight: bigint | undefined,
): Uint8Array => {
  const protoMsgs = messages.map((message) => message.toProto());

  const txBody = {
    messages: protoMsgs,
    memo: memo,
    timeoutHeight: timeoutHeight ? timeoutHeight.toString() : undefined,
  };

  return TxBody.encode(
    // eslint-disable-next-line
    // @ts-ignore
    TxBody.fromPartial(txBody),
  ).finish();
};
export const authzAminoSign = async (
  signerAddres: string,
  msgs: IMsgBase[],
  signer: OfflineAminoSigner,
  fee: StdFee,
  memo: string,
  explicitSignerData: SignerData,
  timeoutHeight?: bigint,
) => {
  const { accountNumber, sequence, chainId } = explicitSignerData;
  const aminoMsgs = msgs.map((msg) => msg.toAmino());
  const signDoc = makeAminoSignDoc(aminoMsgs, fee, chainId, memo, accountNumber, sequence);
  const accountFromSigner = (await signer.getAccounts()).find(
    (account) => account.address === signerAddres,
  );
  console.log("accountFromSigner", accountFromSigner);
  if (!accountFromSigner) {
    throw new Error("Failed to retrieve account from signer");
  }
  const pubkey = encodePubkey(encodeSecp256k1Pubkey(accountFromSigner.pubkey));

  const { signature, signed } = await signer.signAmino(signerAddres, signDoc);
  const signedGasLimit = Int53.fromString(signed.fee.gas).toNumber();
  const signedSequence = Int53.fromString(signed.sequence).toNumber();
  const signMode = SignMode.SIGN_MODE_LEGACY_AMINO_JSON;
  const signedAuthInfoBytes = makeAuthInfoBytes(
    [{ pubkey, sequence: signedSequence }],
    signed.fee.amount,
    signedGasLimit,
    signed.fee.granter,
    signed.fee.payer,
    signMode,
  );
  const txBodyBytes = makeBodyBytes(msgs, memo, timeoutHeight);
  return {
    bodyBytes: txBodyBytes,
    authInfoBytes: signedAuthInfoBytes,
    signatures: [fromBase64(signature.signature)],
  };
};
