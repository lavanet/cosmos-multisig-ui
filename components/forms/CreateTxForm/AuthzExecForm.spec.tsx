import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";
Object.assign(global, { TextEncoder, TextDecoder });
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { toBech32 } from "@cosmjs/encoding";
import {
  Secp256k1Wallet,
  createMultisigThresholdPubkey,
  encodeSecp256k1Pubkey,
  pubkeyToAddress,
} from "@cosmjs/amino";
import { NextRouter } from "next/router";
import { RouterContext } from "next/dist/shared/lib/router-context";
import AuthzExecForm from "./AuthzExecForm";
import CreateTxForm from ".";
import { AuthzAccount, discoverGranters, loadAuthzAccount } from "../../../lib/authz/queries";
import { preflightExec } from "../../../lib/authz/preflight";
import { getMultisigAccount } from "../../../lib/multisigHelpers";
import { requestJson } from "../../../lib/request";
import { MsgTypeUrls } from "../../../types/txMsg";
// Ordinary message forms have separate tests; this suite exercises the real parent and authz form.
jest.mock("./MsgForm", () => ({ __esModule: true, default: () => null }));
jest.mock("../../../context/ChainsContext", () => ({
  useChains: () => ({
    validatorState: {
      validators: validators.map((operatorAddress, i) => ({
        operatorAddress,
        description: { moniker: `Validator ${i}` },
      })),
    },
    chainsDispatch: jest.fn(),
    chain: {
      chainId: "lava-test",
      addressPrefix: "lava@",
      nodeAddress: "rpc",
      registryName: "lava",
      denom: "ulava",
      gasPrice: "0.025ulava",
      assets: [
        {
          base: "ulava",
          display: "lava",
          symbol: "LAVA",
          denom_units: [{ denom: "lava", exponent: 6 }],
        },
      ],
    },
  }),
}));
jest.mock("../../../lib/authz/queries", () => ({
  loadAuthzAccount: jest.fn(),
  discoverGranters: jest.fn(),
  withAuthzQuery: jest.fn().mockRejectedValue(new Error("offline")),
}));
jest.mock("../../../lib/authz/preflight", () => ({
  ...jest.requireActual("../../../lib/authz/preflight"),
  preflightExec: jest.fn(),
}));
jest.mock("../../../lib/multisigHelpers", () => ({ getMultisigAccount: jest.fn() }));
jest.mock("../../../lib/request", () => ({ requestJson: jest.fn() }));
jest.mock("@cosmjs/stargate", () => ({
  ...jest.requireActual("@cosmjs/stargate"),
  StargateClient: { connect: jest.fn().mockResolvedValue({ disconnect: jest.fn() }) },
}));
const granter = toBech32("lava@", new Uint8Array(20).fill(8));
const validators = [1, 2].map((n) => toBech32("lava@valoper", new Uint8Array(20).fill(n)));
let state: AuthzAccount;
let grantee: string;
beforeEach(async () => {
  jest.clearAllMocks();
  let id = 0;
  Object.defineProperty(global.crypto, "randomUUID", {
    configurable: true,
    value: () => `id-${id++}`,
  });
  const wallet = await Secp256k1Wallet.fromKey(new Uint8Array(32).fill(5), "lava@");
  const pubkey = createMultisigThresholdPubkey(
    [encodeSecp256k1Pubkey((await wallet.getAccounts())[0].pubkey)],
    1,
  );
  grantee = pubkeyToAddress(pubkey, "lava@");
  state = {
    granter,
    grantee,
    height: 123,
    time: 1000,
    permissions: [MsgTypeUrls.Send, MsgTypeUrls.WithdrawDelegatorReward].map((typeUrl) => ({
      typeUrl,
      kind: "generic",
    })),
    spendable: [{ denom: "ulava", amount: "2000000" }],
    bondDenom: "ulava",
    delegations: [],
    providers: [],
    rewards: validators.map((validator) => ({
      validator,
      coins: [{ denom: "ulava", amount: "1" }],
    })),
    withdrawAddress: granter,
    proposals: [],
  };
  jest.mocked(discoverGranters).mockResolvedValue([granter, grantee]);
  jest.mocked(loadAuthzAccount).mockResolvedValue(state);
  jest.mocked(preflightExec).mockResolvedValue(200000);
  jest
    .mocked(getMultisigAccount)
    .mockResolvedValue([pubkey, { address: grantee, accountNumber: 17, sequence: 9, pubkey }]);
  jest.mocked(requestJson).mockResolvedValue({ transactionID: "0x123" });
});
function renderForm(initialActionType: string = MsgTypeUrls.Send) {
  render(
    <StrictMode>
      <RouterContext.Provider value={{ push: jest.fn() } as unknown as NextRouter}>
        <AuthzExecForm
          initialActionType={initialActionType}
          senderAddress={grantee}
          accountOnChain={{ address: grantee, accountNumber: 17, sequence: 9, pubkey: null }}
          onBack={jest.fn()}
        />
      </RouterContext.Provider>
    </StrictMode>,
  );
}
async function mount(initialActionType: string = MsgTypeUrls.Send) {
  renderForm(initialActionType);
  await screen.findByRole("option", { name: granter });
  fireEvent.change(screen.getByLabelText("Granter wallet"), { target: { value: granter } });
  await screen.findByText(/Loaded at block 123/);
}
it("selects all rewards and saves one ordered MsgExec with multisig account data", async () => {
  await mount(MsgTypeUrls.WithdrawDelegatorReward);
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all reward validators" }));
  fireEvent.click(screen.getByRole("button", { name: "Review and simulate" }));
  await screen.findByRole("button", { name: "Create unsigned transaction" });
  expect(requestJson).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Create unsigned transaction" }));
  await waitFor(() => expect(requestJson).toHaveBeenCalledTimes(1));
  const body = jest.mocked(requestJson).mock.calls[0][1]!.body as { dataJSON: string };
  const tx = JSON.parse(body.dataJSON);
  expect(tx.accountNumber).toBe(17);
  expect(tx.sequence).toBe(9);
  expect(tx.msgs).toHaveLength(1);
  expect(tx.msgs[0].value.grantee).toBe(grantee);
  expect(
    tx.msgs[0].value.msgs.map(
      (m: { value: { validatorAddress: string; delegatorAddress: string } }) => m.value,
    ),
  ).toEqual(
    validators.map((validatorAddress) => ({ validatorAddress, delegatorAddress: granter })),
  );
  expect(tx.fee.gas).toBe("280000");
  expect(preflightExec).toHaveBeenCalledTimes(3);
});
it("blocks saving when refreshed grants or simulation fail", async () => {
  await mount();
  fireEvent.change(screen.getByLabelText("Recipient 1"), { target: { value: grantee } });
  fireEvent.change(screen.getByLabelText("Amount 1"), { target: { value: "1.25" } });
  jest.mocked(preflightExec).mockRejectedValueOnce(new Error("Grant revoked"));
  fireEvent.click(screen.getByRole("button", { name: "Review and simulate" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Grant revoked");
  expect(screen.queryByRole("button", { name: "Create unsigned transaction" })).toBeNull();
  expect(requestJson).not.toHaveBeenCalled();
});
it("resets actions when granter changes and keeps the selected grant type", async () => {
  await mount();
  expect(screen.queryByText("Add another action")).toBeNull();
  expect(screen.queryByRole("button", { name: "Staking unbond" })).toBeNull();
  expect(screen.getByRole("button", { name: "Review and simulate" })).toHaveClass("primary-action");
  fireEvent.change(screen.getByLabelText("Granter wallet"), { target: { value: grantee } });
  expect(screen.queryByLabelText("Recipient 1")).toBeNull();
  expect(screen.queryByRole("button", { name: "Review and simulate" })).toBeNull();
  await screen.findByText(/Loaded at block 123/);
});

it("opens the selected authz action from the existing transaction modules on the same screen", async () => {
  render(
    <RouterContext.Provider value={{ push: jest.fn() } as unknown as NextRouter}>
      <CreateTxForm
        senderAddress={grantee}
        accountOnChain={{ address: grantee, accountNumber: 17, sequence: 9, pubkey: null }}
      />
    </RouterContext.Provider>,
  );
  const category = screen.getByRole("group", { name: "On behalf of another wallet" });
  expect(screen.queryByRole("button", { name: "Act on behalf of another wallet" })).toBeNull();
  fireEvent.click(within(category).getByRole("button", { name: "Transfer tokens" }));
  expect(screen.getByRole("heading", { name: "Create New Transaction" })).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Transfer tokens — on behalf of another wallet" }),
  ).toBeInTheDocument();
  await screen.findByRole("option", { name: granter });
  fireEvent.change(screen.getByLabelText("Granter wallet"), { target: { value: granter } });
  await screen.findByLabelText("Recipient 1");
  expect(screen.getByLabelText("Amount 1")).toBeInTheDocument();
  expect(screen.getByText("Permissions (2)").closest("details")).not.toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Remove transaction" }));
  expect(screen.queryByLabelText("Granter wallet")).toBeNull();
  expect(within(category).getByRole("button", { name: "Transfer tokens" })).not.toBeDisabled();
});
it("preserves the selected action when a different granter is loaded", async () => {
  await mount(MsgTypeUrls.Send);
  fireEvent.change(screen.getByLabelText("Recipient 1"), { target: { value: grantee } });
  fireEvent.change(screen.getByLabelText("Granter wallet"), { target: { value: grantee } });
  expect(screen.queryByLabelText("Recipient 1")).toBeNull();
  expect(await screen.findByLabelText("Recipient 1")).toHaveValue("");
});
it("shows the chosen action but blocks review if the wallet lacks its grant", async () => {
  await mount(MsgTypeUrls.Undelegate);
  expect(screen.getByRole("alert")).toHaveTextContent("no matching, unexpired permission");
  expect(screen.getByRole("button", { name: "Review and simulate" })).toBeDisabled();
  expect(requestJson).not.toHaveBeenCalled();
});

it("discovers wallets for the exact selected action without automatically choosing one", async () => {
  renderForm(MsgTypeUrls.Send);
  expect(screen.getByLabelText("Granter wallet")).toBeDisabled();
  await screen.findByRole("option", { name: granter });
  expect(discoverGranters).toHaveBeenLastCalledWith("rpc", "lava-test", grantee, MsgTypeUrls.Send);
  expect(screen.getByLabelText("Granter wallet")).toHaveValue("");
  expect(loadAuthzAccount).not.toHaveBeenCalled();
});
it("keeps discovery failures distinct from no authorized wallets and supports retry", async () => {
  jest.mocked(discoverGranters).mockRejectedValue(new Error("RPC unavailable"));
  renderForm(MsgTypeUrls.Send);
  expect(await screen.findByRole("alert")).toHaveTextContent("RPC unavailable");
  expect(screen.getByLabelText("Granter wallet")).toBeDisabled();
  jest.mocked(discoverGranters).mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "Refresh wallets" }));
  await screen.findByText(/No wallets/);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByLabelText("Granter wallet")).toBeDisabled();
  expect(loadAuthzAccount).not.toHaveBeenCalled();
});

it.each([
  MsgTypeUrls.Delegate,
  MsgTypeUrls.BeginRedelegate,
  MsgTypeUrls.DualDelegate,
  MsgTypeUrls.DualRedelegate,
  MsgTypeUrls.DualClaimRewards,
])("builds and saves the selected guided action %s with the granter as actor", async (typeUrl) => {
  state.permissions.push({ typeUrl, kind: "generic" });
  state.stakingBalance = [{ denom: "ulava", amount: "3000000" }];
  state.delegations = [{ validator: validators[0], amount: "2000000" }];
  state.providers = [{ provider: granter, amount: "2000000" }];
  await mount(typeUrl);
  const amount = { denom: "ulava", amount: "1250000" };
  let value: Record<string, unknown>;
  if (typeUrl === MsgTypeUrls.Delegate || typeUrl === MsgTypeUrls.DualDelegate) {
    fireEvent.change(screen.getByLabelText("Validator 1"), { target: { value: validators[0] } });
    value = { delegatorAddress: granter, validatorAddress: validators[0], amount };
    if (typeUrl === MsgTypeUrls.DualDelegate) {
      fireEvent.change(screen.getByLabelText("Provider 1"), { target: { value: grantee } });
      value = {
        creator: granter,
        validator: validators[0],
        provider: grantee,
        chainID: "*",
        amount,
      };
    }
  } else if (typeUrl === MsgTypeUrls.BeginRedelegate) {
    fireEvent.change(screen.getByLabelText("Validator 1"), { target: { value: validators[0] } });
    fireEvent.change(screen.getByLabelText("Destination validator 1"), {
      target: { value: validators[1] },
    });
    value = {
      delegatorAddress: granter,
      validatorSrcAddress: validators[0],
      validatorDstAddress: validators[1],
      amount,
    };
  } else if (typeUrl === MsgTypeUrls.DualRedelegate) {
    fireEvent.change(screen.getByLabelText("Provider 1"), { target: { value: granter } });
    fireEvent.change(screen.getByLabelText("Destination provider 1"), {
      target: { value: grantee },
    });
    value = {
      creator: granter,
      fromProvider: granter,
      toProvider: grantee,
      fromChainID: "*",
      toChainID: "*",
      amount,
    };
  } else {
    value = { creator: granter, provider: "" };
    expect(screen.queryByLabelText("Amount 1")).toBeNull();
  }
  if (typeUrl !== MsgTypeUrls.DualClaimRewards) {
    fireEvent.change(screen.getByLabelText("Amount 1"), { target: { value: "1.25" } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Review and simulate" }));
  fireEvent.click(await screen.findByRole("button", { name: "Create unsigned transaction" }));
  await waitFor(() => expect(requestJson).toHaveBeenCalledTimes(1));
  const body = jest.mocked(requestJson).mock.calls[0][1]!.body as { dataJSON: string };
  expect(JSON.parse(body.dataJSON).msgs[0].value.msgs).toEqual([{ typeUrl, value }]);
});

it("identifies account-loading failures and preserves the RPC error for diagnosis", async () => {
  await mount();
  fireEvent.change(screen.getByLabelText("Recipient 1"), { target: { value: grantee } });
  fireEvent.change(screen.getByLabelText("Amount 1"), { target: { value: "1" } });
  jest
    .mocked(getMultisigAccount)
    .mockRejectedValueOnce(new Error("hex string contains invalid characters"));
  fireEvent.click(screen.getByRole("button", { name: "Review and simulate" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Load the multisig account and public key failed: hex string contains invalid characters",
  );
  expect(requestJson).not.toHaveBeenCalled();
});
