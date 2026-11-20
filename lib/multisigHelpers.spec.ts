/** @jest-environment node */
import {
  createMultisigThresholdPubkey,
  encodeSecp256k1Pubkey,
  pubkeyToAddress,
  Secp256k1Wallet,
} from "@cosmjs/amino";
import { StargateClient } from "@cosmjs/stargate";
import { getMultisigAccount } from "./multisigHelpers";
import { requestJson } from "./request";
jest.mock("./request", () => ({ requestJson: jest.fn() }));

it("loads a first-use multisig key from the app while preserving on-chain account number and sequence", async () => {
  const wallet = await Secp256k1Wallet.fromKey(new Uint8Array(32).fill(1), "lava@");
  const pubkey = createMultisigThresholdPubkey(
    [encodeSecp256k1Pubkey((await wallet.getAccounts())[0].pubkey)],
    1,
  );
  const address = pubkeyToAddress(pubkey, "lava@");
  const account = { address, pubkey: null, accountNumber: 53532, sequence: 0 };
  const client = {
    getAccount: jest.fn().mockResolvedValue(account),
    getChainId: jest.fn().mockResolvedValue("lava-mainnet-1"),
  } as unknown as StargateClient;
  jest.mocked(requestJson).mockResolvedValue({ pubkeyJSON: JSON.stringify(pubkey) });
  await expect(getMultisigAccount(address, "lava@", client)).resolves.toEqual([pubkey, account]);
  expect(requestJson).toHaveBeenCalledWith(`/api/chain/lava-mainnet-1/multisig/${address}`);
  jest
    .mocked(requestJson)
    .mockResolvedValue({
      pubkeyJSON: JSON.stringify({ ...pubkey, value: { ...pubkey.value, threshold: "2" } }),
    });
  await expect(getMultisigAccount(address, "lava@", client)).rejects.toThrow();
});
