/** @jest-environment node */
// Explicitly opt in: LAVA_AUTHZ_LIVE_TEST=1 npm run test:ci -- --runInBand live.integration
// Queries and /Simulate only. This test never signs or broadcasts a transaction.
import { StargateClient } from "@cosmjs/stargate";
import { encodePubkey, makeAuthInfoBytes } from "@cosmjs/proto-signing";
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { SignMode } from "cosmjs-types/cosmos/tx/signing/v1beta1/signing";
import { discoverGranters, loadAuthzAccount, simulateBytes } from "./queries";
import { approvedTransaction } from "../transactionIntegrity";
import { EXEC } from "./messages";
import { MsgTypeUrls } from "../../types/txMsg";
const live = process.env.LAVA_AUTHZ_LIVE_TEST === "1" ? it : it.skip;
live(
  "reads public Lava grants and simulates an existing reward authorization without signing",
  async () => {
    const url = "https://lava-rpc.polkachu.com";
    const granter = "lava@1rsuk55hysp2trjjaqn3zrasrf0qwe5x366knhg";
    const grantee = "lava@1nx6r05meml2rqnxs57q37reer20jqgse8cy0qq";
    const client = await StargateClient.connect(url);
    try {
      const chainId = await client.getChainId();
      expect(await discoverGranters(url, chainId, grantee)).toContain(granter);
      const state = await loadAuthzAccount(url, chainId, "lava@", granter, grantee);
      expect(state.height).toBeGreaterThan(0);
      expect(state.permissions.some((p) => p.typeUrl === MsgTypeUrls.WithdrawDelegatorReward)).toBe(
        true,
      );
      expect(state.rewards.length).toBeGreaterThan(0);
      const account = await client.getAccount(grantee);
      if (!account?.pubkey) throw new Error("Public test account has no key");
      const tx = {
        chainId,
        accountNumber: account.accountNumber,
        sequence: account.sequence,
        memo: "",
        fee: { gas: "1000000", amount: [{ denom: "ulava", amount: "10000" }] },
        msgs: [
          {
            typeUrl: EXEC,
            value: {
              grantee,
              msgs: [
                {
                  typeUrl: MsgTypeUrls.WithdrawDelegatorReward,
                  value: {
                    delegatorAddress: granter,
                    validatorAddress: state.rewards[0].validator,
                  },
                },
              ],
            },
          },
        ],
      };
      const bytes = TxRaw.encode({
        bodyBytes: approvedTransaction(tx, grantee).body,
        authInfoBytes: makeAuthInfoBytes(
          [{ pubkey: encodePubkey(account.pubkey), sequence: account.sequence }],
          tx.fee.amount,
          Number(tx.fee.gas),
          undefined,
          undefined,
          SignMode.SIGN_MODE_LEGACY_AMINO_JSON,
        ),
        signatures: [new Uint8Array(64)],
      }).finish();
      expect(await simulateBytes(url, chainId, bytes)).toBeGreaterThan(0);
      // The first guided estimate intentionally starts without a fee or gas limit.
      const zeroFee = { ...tx, fee: { amount: [], gas: "0" } };
      const estimate = TxRaw.encode({
        bodyBytes: approvedTransaction(zeroFee, grantee).body,
        authInfoBytes: makeAuthInfoBytes(
          [{ pubkey: encodePubkey(account.pubkey), sequence: account.sequence }],
          [],
          0,
          undefined,
          undefined,
          SignMode.SIGN_MODE_LEGACY_AMINO_JSON,
        ),
        signatures: [new Uint8Array(64)],
      }).finish();
      expect(await simulateBytes(url, chainId, estimate)).toBeGreaterThan(0);
    } finally {
      client.disconnect();
    }
  },
  60000,
);
