/** @jest-environment node */
import {
  Secp256k1Wallet,
  createMultisigThresholdPubkey,
  encodeSecp256k1Pubkey,
  pubkeyToAddress,
} from "@cosmjs/amino";
import { Registry } from "@cosmjs/proto-signing";
import {
  AminoTypes,
  createDefaultAminoConverters,
  defaultRegistryTypes,
  makeMultisignedTxBytes,
  SigningStargateClient,
} from "@cosmjs/stargate";
import { TxBody, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { MultiSignature } from "cosmjs-types/cosmos/crypto/multisig/v1beta1/multisig";
import { MsgCancelUnbondingDelegation } from "cosmjs-types/cosmos/staking/v1beta1/tx";
import { dbTxFromJson, exportMsgToJson, gasOfTx } from "./txMsgHelpers";
import { MsgTypeUrls } from "../types/txMsg";

it.each([1, 19])(
  "persists exact heights and signs a 2-of-2 Amino multisig with %i cancellations",
  async (count) => {
    const wallets = await Promise.all(
      [1, 2].map((n) => Secp256k1Wallet.fromKey(new Uint8Array(32).fill(n), "lava@")),
    );
    const accounts = await Promise.all(wallets.map(async (w) => (await w.getAccounts())[0]));
    const pubkey = createMultisigThresholdPubkey(
      accounts.map((account) => encodeSecp256k1Pubkey(account.pubkey)),
      2,
    );
    const value = MsgCancelUnbondingDelegation.fromPartial({
      delegatorAddress: pubkeyToAddress(pubkey, "lava@"),
      validatorAddress: "lavavaloper1test",
      amount: { denom: "ulava", amount: "1234567" },
      creationHeight: BigInt("9007199254740993"),
    });
    const msg = { typeUrl: MsgTypeUrls.CancelUnbondingDelegation, value };
    const messages = Array.from({ length: count }, (_, i) => ({
      ...msg,
      value: { ...value, creationHeight: value.creationHeight + BigInt(i) },
    }));
    const fee = {
      amount: [{ denom: "ulava", amount: "1000" }],
      gas: gasOfTx(messages.map((message) => message.typeUrl)).toString(),
    };
    const tx = dbTxFromJson(
      JSON.stringify({
        accountNumber: 1,
        sequence: 2,
        chainId: "lava-test",
        msgs: messages.map(exportMsgToJson),
        fee,
        memo: "cancel selected entry",
      }),
    )!;
    expect(tx.msgs[0].value.creationHeight).toBe(value.creationHeight);
    const amino = new AminoTypes(createDefaultAminoConverters());
    const aminoMsg = amino.toAmino(msg);
    expect(aminoMsg.type).toBe("cosmos-sdk/MsgCancelUnbondingDelegation");
    expect(aminoMsg.value.creation_height).toBe("9007199254740993");
    expect(amino.fromAmino(aminoMsg)).toEqual(msg);
    const registry = new Registry(defaultRegistryTypes);
    expect(registry.decode(registry.encodeAsAny(msg))).toEqual(value);
    const signed = await Promise.all(
      wallets.map(async (wallet, i) => {
        const client = await SigningStargateClient.offline(wallet);
        return client.sign(accounts[i].address, tx.msgs, fee, tx.memo, {
          accountNumber: 1,
          sequence: 2,
          chainId: "lava-test",
        });
      }),
    );
    expect(signed[0].bodyBytes).toEqual(signed[1].bodyBytes);
    const bytes = makeMultisignedTxBytes(
      pubkey,
      2,
      fee,
      signed[0].bodyBytes,
      new Map(accounts.map((account, i) => [account.address, signed[i].signatures[0]])),
    );
    const raw = TxRaw.decode(bytes);
    expect(MultiSignature.decode(raw.signatures[0]).signatures).toHaveLength(2);
    const body = TxBody.decode(raw.bodyBytes);
    expect(body.messages).toHaveLength(count);
    expect(body.messages.map((message) => registry.decode(message))).toEqual(
      messages.map((message) => message.value),
    );
    expect(registry.decode(body.messages[0])).toEqual(value);
  },
);
