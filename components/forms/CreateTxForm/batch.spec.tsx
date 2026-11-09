import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRouter } from "next/router";
import { RouterContext } from "next/dist/shared/lib/router-context";
import CreateTxForm from ".";
import { requestJson } from "../../../lib/request";
import {
  getUnbondingSnapshot,
  validateCancelUnbondingMessages,
} from "../../../lib/cancelUnbonding";

jest.mock("@/lib/utils", () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock("../../../lib/request", () => ({ requestJson: jest.fn() }));
jest.mock("../../../lib/cancelUnbonding", () => ({
  ...jest.requireActual("../../../lib/cancelUnbonding"),
  getUnbondingSnapshot: jest.fn(),
  validateCancelUnbondingMessages: jest.fn(),
}));
jest.mock("../../../context/ChainsContext", () => ({
  useChains: () => ({
    chain: {
      registryName: "lava",
      chainId: "lava-test",
      nodeAddress: "rpc",
      displayDenom: "lava",
      gasPrice: "0.025ulava",
      assets: [
        {
          base: "ulava",
          display: "lava",
          symbol: "LAVA",
          name: "Lava",
          denom_units: [
            { denom: "ulava", exponent: 0 },
            { denom: "lava", exponent: 6 },
          ],
        },
      ],
    },
    validatorState: { validators: [] },
    chainsDispatch: jest.fn(),
  }),
}));
// Exercise the actual batch form and parent transaction assembly without loading unrelated forms.
jest.mock("./MsgForm", () => {
  const Form = jest.requireActual("./MsgForm/MsgCancelUnbondingDelegationForm").default;
  return {
    __esModule: true,
    default: ({ senderAddress, ...props }: { senderAddress: string }) => (
      <Form delegatorAddress={senderAddress} {...props} />
    ),
  };
});
const gasInput = () => document.querySelector('input[name="gas-limit"]') as HTMLInputElement;
beforeEach(() => {
  jest.clearAllMocks();
  let nextId = 0;
  Object.defineProperty(global.crypto, "randomUUID", {
    configurable: true,
    value: () => `form-${nextId++}`,
  });

  (requestJson as jest.Mock).mockResolvedValue({ transactionID: "test-proposal" });
  (validateCancelUnbondingMessages as jest.Mock).mockResolvedValue(undefined);
  (getUnbondingSnapshot as jest.Mock).mockResolvedValue({
    denom: "ulava",
    blockTime: Date.now(),
    entries: Array.from({ length: 19 }, (_, i) => ({
      validatorAddress: "validator",
      validatorName: "Validator",
      creationHeight: String(i + 1),
      balance: "1000000",
      completionTime: Date.now() + 60000,
      unavailableReason: "",
    })),
  });
});
const mount = () =>
  render(
    <StrictMode>
      <RouterContext.Provider value={{ push: jest.fn() } as unknown as NextRouter}>
        <CreateTxForm
          senderAddress="multisig"
          accountOnChain={{ address: "multisig", accountNumber: 1, sequence: 2, pubkey: null }}
        />
      </RouterContext.Provider>
    </StrictMode>,
  );
it("saves all 19 messages in one proposal with the correct gas under StrictMode", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Cancel unbonding File" }));
  await screen.findByRole("checkbox", { name: "Select entry 1" });
  expect(gasInput().value).toBe("100000");
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all pending entries" }));
  expect(gasInput().value).toBe("7700000");
  fireEvent.click(screen.getByRole("button", { name: "Create Transaction" }));
  await waitFor(() => expect(requestJson).toHaveBeenCalledTimes(1));
  const tx = JSON.parse((requestJson as jest.Mock).mock.calls[0][1].body.dataJSON);
  expect(tx.msgs).toHaveLength(19);
  expect(
    tx.msgs.map((message: { value: { creationHeight: string } }) => message.value.creationHeight),
  ).toEqual(Array.from({ length: 19 }, (_, i) => String(i + 1)));
  expect(tx.fee.gas).toBe("7700000");
  expect(validateCancelUnbondingMessages).toHaveBeenCalledWith("rpc", tx.msgs, "multisig");
});
it("adjusts gas for deselection and removal without stale messages or duplicate increments", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Cancel unbonding File" }));
  await screen.findByRole("checkbox", { name: "Select entry 1" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all pending entries" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select entry 1" }));
  expect(gasInput().value).toBe("7300000");
  fireEvent.click(screen.getByRole("button", { name: "Cancel unbonding File" }));
  expect(gasInput().value).toBe("7300000");
  fireEvent.click(screen.getAllByRole("button", { name: "Remove cancellation" })[1]);
  expect(gasInput().value).toBe("7300000");
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(gasInput().value).toBe("100000");
  fireEvent.click(screen.getByRole("button", { name: "Create Transaction" }));
  expect(requestJson).not.toHaveBeenCalled();
});
it("does not save if the chain preflight rejects a stale batch", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  (validateCancelUnbondingMessages as jest.Mock).mockRejectedValueOnce(new Error("Entry expired"));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Cancel unbonding File" }));
  await screen.findByRole("checkbox", { name: "Select entry 1" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all pending entries" }));
  fireEvent.click(screen.getByRole("button", { name: "Create Transaction" }));
  await waitFor(() => expect(validateCancelUnbondingMessages).toHaveBeenCalled());
  expect(requestJson).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});
