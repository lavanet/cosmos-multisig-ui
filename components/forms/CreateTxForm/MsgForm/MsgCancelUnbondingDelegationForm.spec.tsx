import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MsgGetter } from "..";
import { getUnbondingSnapshot, UnbondingSnapshot } from "../../../../lib/cancelUnbonding";
import MsgCancelUnbondingDelegationForm from "./MsgCancelUnbondingDelegationForm";

jest.mock("../../../../context/ChainsContext", () => ({
  useChains: () => ({
    chain: {
      nodeAddress: "rpc",
      displayDenom: "lava",
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
  }),
}));
jest.mock("../../../../lib/cancelUnbonding", () => ({
  ...jest.requireActual("../../../../lib/cancelUnbonding"),
  getUnbondingSnapshot: jest.fn(),
}));
const snapshot = (): UnbondingSnapshot => ({
  denom: "ulava",
  blockTime: Date.now(),
  entries: [1, 2].map((n) => ({
    validatorAddress: `validator${n}`,
    validatorName: `Validator ${n}`,
    creationHeight: `${n}`,
    balance: `${n}000000`,
    completionTime: Date.now() + 60000,
    unavailableReason: "",
  })),
});
let getter: MsgGetter;
const setMsgGetter = (value: MsgGetter) => {
  getter = value;
};
const renderForm = (msg?: unknown) =>
  render(
    <MsgCancelUnbondingDelegationForm
      delegatorAddress="multisig"
      setMsgGetter={setMsgGetter}
      deleteMsg={jest.fn()}
      msg={msg}
    />,
  );
beforeEach(() => {
  jest.clearAllMocks();
  (getUnbondingSnapshot as jest.Mock).mockResolvedValue(snapshot());
});

it("requires selection, defaults only the selected entry to its full balance, and allows partial cancellation", async () => {
  renderForm();
  await screen.findByRole("checkbox", { name: "Select entry 1" });
  act(() => {
    expect(getter.isMsgValid()).toBe(false);
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Select entry 2" }));
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("2");
  expect(getter.msg.value.validatorAddress).toBe("validator2");
  expect(getter.msg.value.creationHeight).toBe(BigInt(2));
  act(() => {
    expect(getter.isMsgValid()).toBe(true);
  });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "0.5" } });
  expect(getter.msg.value.amount).toEqual({ denom: "ulava", amount: "500000" });
  act(() => {
    expect(getter.isMsgValid()).toBe(true);
  });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "3" } });
  act(() => {
    expect(getter.isMsgValid()).toBe(false);
  });
  expect(screen.getByRole("alert").textContent).toContain("exceeds");
});

it("shows empty and failed queries, and can retry", async () => {
  (getUnbondingSnapshot as jest.Mock).mockRejectedValueOnce(new Error("RPC unavailable"));
  renderForm();
  expect((await screen.findByRole("alert")).textContent).toContain("RPC unavailable");
  (getUnbondingSnapshot as jest.Mock).mockResolvedValueOnce({ ...snapshot(), entries: [] });
  fireEvent.click(screen.getByRole("button", { name: "Refresh entries" }));
  await screen.findByText("No pending unbonding entries for this multisig.");
  act(() => {
    expect(getter.isMsgValid()).toBe(false);
  });
});

it("preserves imported partial amount and rejects expired or missing imported entries", async () => {
  renderForm({
    delegatorAddress: "multisig",
    validatorAddress: "validator1",
    creationHeight: "1",
    amount: { denom: "ulava", amount: "250000" },
  });
  await screen.findByRole("checkbox", { name: "Select entry 1" });
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("0.25");
  act(() => {
    expect(getter.isMsgValid()).toBe(true);
  });
  const expired = snapshot();
  expired.entries[0].completionTime = Date.now() - 1000;
  (getUnbondingSnapshot as jest.Mock).mockResolvedValueOnce(expired);
  fireEvent.click(screen.getByRole("button", { name: "Refresh entries" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("checkbox", { name: "Select entry 1" }) as HTMLInputElement).disabled,
    ).toBe(true),
  );
  act(() => {
    expect(getter.isMsgValid()).toBe(false);
  });
  expect(screen.getByRole("alert").textContent).toContain("completed");
});

it("selects all entries across validators, emits distinct messages, and supports deselection", async () => {
  renderForm();
  await screen.findByRole("checkbox", { name: "Select entry 1" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all pending entries" }));
  expect(getter.msgs).toHaveLength(2);
  expect(getter.msgs?.map((message) => message.value.creationHeight)).toEqual([
    BigInt(1),
    BigInt(2),
  ]);
  expect(screen.getByText("3 lava returning to staking")).toBeTruthy();
  act(() => expect(getter.isMsgValid()).toBe(true));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all for Validator 1" }));
  expect(getter.msgs).toHaveLength(1);
  expect(getter.msgs?.[0].value.validatorAddress).toBe("validator2");
});
it("excludes unavailable entries from select all", async () => {
  const data = snapshot();
  data.entries[0].unavailableReason = "Validator is jailed";
  (getUnbondingSnapshot as jest.Mock).mockResolvedValueOnce(data);
  renderForm();
  await screen.findByRole("checkbox", { name: "Select entry 1" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all pending entries" }));
  expect(getter.msgs).toHaveLength(1);
  expect(getter.msgs?.[0].value.validatorAddress).toBe("validator2");
});
