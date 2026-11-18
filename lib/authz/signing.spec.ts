/** @jest-environment node */
import {
  Secp256k1Wallet,
  createMultisigThresholdPubkey,
  encodeSecp256k1Pubkey,
  pubkeyToAddress,
  OfflineAminoSigner,
} from "@cosmjs/amino";
import { toBase64, toBech32 } from "@cosmjs/encoding";
import { makeMultisignedTxBytes, SigningStargateClient } from "@cosmjs/stargate";
import { MsgExec } from "cosmjs-types/cosmos/authz/v1beta1/tx";
import { TxRaw, TxBody } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { MultiSignature } from "cosmjs-types/cosmos/crypto/multisig/v1beta1/multisig";
import { DbTransaction } from "../../types";
import { MsgTypeUrls } from "../../types/txMsg";
import { approvedTransaction, verifiedSignatures } from "../transactionIntegrity";
import { authzAminoSign } from "../authzAminoSinger";
import { EXEC, VOTE_V1, execMessages } from "./messages";
const validator = toBech32("lava@valoper", new Uint8Array(20).fill(7));
async function fixture() {
  const wallets = await Promise.all(
    [1, 2, 3, 4].map((n) => Secp256k1Wallet.fromKey(new Uint8Array(32).fill(n), "lava@")),
  );
  const accounts = await Promise.all(wallets.map(async (w) => (await w.getAccounts())[0]));
  const pubkey = createMultisigThresholdPubkey(
    accounts.slice(0, 3).map((a) => encodeSecp256k1Pubkey(a.pubkey)),
    2,
  );
  const grantee = pubkeyToAddress(pubkey, "lava@");
  const granter = accounts[3].address;
  const amount = { denom: "ulava", amount: "1234567" };
  const actions = [
    {
      typeUrl: MsgTypeUrls.Send,
      value: { fromAddress: granter, toAddress: accounts[0].address, amount: [amount] },
    },
    ...[MsgTypeUrls.Vote, VOTE_V1].map((typeUrl) => ({
      typeUrl,
      value: { voter: granter, proposalId: "9007199254740993", option: 1 },
    })),
    {
      typeUrl: MsgTypeUrls.WithdrawDelegatorReward,
      value: { delegatorAddress: granter, validatorAddress: validator },
    },
    {
      typeUrl: MsgTypeUrls.Undelegate,
      value: { delegatorAddress: granter, validatorAddress: validator, amount },
    },
    {
      typeUrl: MsgTypeUrls.Delegate,
      value: { delegatorAddress: granter, validatorAddress: validator, amount },
    },
    {
      typeUrl: MsgTypeUrls.BeginRedelegate,
      value: {
        delegatorAddress: granter,
        validatorSrcAddress: validator,
        validatorDstAddress: toBech32("lava@valoper", new Uint8Array(20).fill(8)),
        amount,
      },
    },
    {
      typeUrl: MsgTypeUrls.DualDelegate,
      value: { creator: granter, validator, provider: accounts[0].address, chainID: "*", amount },
    },
    {
      typeUrl: MsgTypeUrls.DualRedelegate,
      value: {
        creator: granter,
        fromProvider: accounts[0].address,
        toProvider: accounts[1].address,
        fromChainID: "*",
        toChainID: "*",
        amount,
      },
    },
    { typeUrl: MsgTypeUrls.DualClaimRewards, value: { creator: granter, provider: "" } },
    {
      typeUrl: MsgTypeUrls.DualUnbond,
      value: { creator: granter, validator, provider: accounts[0].address, chainID: "*", amount },
    },
  ];
  const tx: DbTransaction = {
    accountNumber: 17,
    sequence: 9,
    chainId: "lava-test",
    memo: "granter actions",
    fee: { amount: [{ denom: "ulava", amount: "2000" }], gas: "1000000" },
    msgs: [{ typeUrl: EXEC, value: { grantee, msgs: actions } }],
  };
  return { wallets, accounts, pubkey, grantee, tx, actions };
}
it.each(Array.from({ length: 12 }, (_, i) => i))(
  "signs and verifies 2-of-3 offline authz, case %i",
  async (index) => {
    const { wallets, accounts, pubkey, grantee, tx, actions } = await fixture();
    if (index < actions.length) tx.msgs[0].value.msgs = [actions[index]];
    const signed = await Promise.all(
      wallets
        .slice(0, 2)
        .map((w, i) =>
          authzAminoSign(accounts[i].address, execMessages(tx.msgs), w, tx.fee, tx.memo, tx),
        ),
    );
    expect(signed[0].bodyBytes).toEqual(approvedTransaction(tx, grantee).body);
    expect(signed[1].bodyBytes).toEqual(signed[0].bodyBytes);
    const signatures = signed.map((s, i) => ({
      address: accounts[i].address,
      signature: toBase64(s.signatures[0]),
      bodyBytes: toBase64(s.bodyBytes),
    }));
    expect(await verifiedSignatures(tx, pubkey, "lava@", signatures, grantee)).toEqual(signatures);
    const raw = TxRaw.decode(
      makeMultisignedTxBytes(
        pubkey,
        tx.sequence,
        tx.fee,
        signed[0].bodyBytes,
        new Map(signed.map((s, i) => [accounts[i].address, s.signatures[0]])),
      ),
    );
    expect(MultiSignature.decode(raw.signatures[0]).signatures).toHaveLength(2);
    expect(MsgExec.decode(TxBody.decode(raw.bodyBytes).messages[0].value).msgs).toHaveLength(
      index < actions.length ? 1 : actions.length,
    );
  },
);
it("rejects wallet mutations to fee, memo, sequence or messages", async () => {
  const { wallets, accounts, tx } = await fixture();
  for (const mutate of [
    { memo: "changed" },
    { sequence: "10" },
    { fee: { ...tx.fee, gas: "999" } },
    { msgs: [] },
  ]) {
    const wallet: OfflineAminoSigner = {
      getAccounts: () => wallets[0].getAccounts(),
      signAmino: async (address, doc) => ({
        ...(await wallets[0].signAmino(address, doc)),
        signed: { ...doc, ...mutate },
      }),
    };
    await expect(
      authzAminoSign(accounts[0].address, execMessages(tx.msgs), wallet, tx.fee, tx.memo, tx),
    ).rejects.toThrow(/Wallet changed/);
  }
});
it("does not count duplicates, outsider signatures, body swaps or forged signatures", async () => {
  const { wallets, accounts, pubkey, grantee, tx } = await fixture();
  const signed = await Promise.all(
    [0, 3].map((i) =>
      authzAminoSign(accounts[i].address, execMessages(tx.msgs), wallets[i], tx.fee, tx.memo, tx),
    ),
  );
  const valid = {
    address: accounts[0].address,
    signature: toBase64(signed[0].signatures[0]),
    bodyBytes: toBase64(signed[0].bodyBytes),
  };
  const outsider = {
    ...valid,
    address: accounts[3].address,
    signature: toBase64(signed[1].signatures[0]),
  };
  const bad = [
    valid,
    valid,
    outsider,
    { ...valid, address: accounts[1].address },
    { ...valid, bodyBytes: toBase64(new Uint8Array(20)) },
    { ...valid, signature: toBase64(new Uint8Array(64)) },
  ];
  expect(await verifiedSignatures(tx, pubkey, "lava@", bad, grantee)).toEqual([valid]);
  expect(
    await verifiedSignatures({ ...tx, memo: "changed" }, pubkey, "lava@", [valid], grantee),
  ).toEqual([]);
  await expect(
    verifiedSignatures(tx, pubkey, "lava@", [valid], accounts[3].address),
  ).rejects.toThrow(/public key/);
});
it("preserves the ordinary transaction signing path", async () => {
  const { wallets, accounts, pubkey, grantee, tx } = await fixture();
  tx.msgs = [
    {
      typeUrl: MsgTypeUrls.Send,
      value: {
        fromAddress: grantee,
        toAddress: accounts[3].address,
        amount: [{ denom: "ulava", amount: "1" }],
      },
    },
  ];
  const client = await SigningStargateClient.offline(wallets[0]);
  const signed = await client.sign(accounts[0].address, tx.msgs, tx.fee, tx.memo, tx);
  const sig = {
    address: accounts[0].address,
    signature: toBase64(signed.signatures[0]),
    bodyBytes: toBase64(signed.bodyBytes),
  };
  expect(await verifiedSignatures(tx, pubkey, "lava@", [sig], grantee)).toEqual([sig]);
});
