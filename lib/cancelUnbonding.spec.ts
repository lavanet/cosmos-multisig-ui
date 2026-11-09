/** @jest-environment node */
import { QueryClient } from "@cosmjs/stargate";
import { connectComet } from "@cosmjs/tendermint-rpc";
import { MsgCancelUnbondingDelegation } from "cosmjs-types/cosmos/staking/v1beta1/tx";
import {
  getUnbondingSnapshot,
  validateCancellation,
  validateCancelUnbondingMessages,
  UnbondingSnapshot,
} from "./cancelUnbonding";
import { MsgTypeUrls } from "../types/txMsg";

jest.mock("@cosmjs/tendermint-rpc", () => ({
  ...jest.requireActual("@cosmjs/tendermint-rpc"),
  connectComet: jest.fn(),
}));
const snapshot = (): UnbondingSnapshot => ({
  denom: "ulava",
  blockTime: 1000,
  entries: [
    {
      validatorAddress: "lavavaloper1test",
      validatorName: "Validator",
      creationHeight: "9007199254740993",
      balance: "1000000",
      completionTime: 10000,
      unavailableReason: "",
    },
  ],
});
const message = (amount = "1000000") =>
  MsgCancelUnbondingDelegation.fromPartial({
    delegatorAddress: "lava@test",
    validatorAddress: "lavavaloper1test",
    creationHeight: BigInt("9007199254740993"),
    amount: { denom: "ulava", amount },
  });

describe("cancellation validation", () => {
  it.each(["1", "500000", "1000000"])("accepts partial/full amount %s", (amount) =>
    expect(() => validateCancellation(snapshot(), message(amount))).not.toThrow(),
  );
  it.each(["0", "-1", "1.5", "1000001"])("rejects invalid amount %s", (amount) =>
    expect(() => validateCancellation(snapshot(), message(amount))).toThrow(),
  );
  it("rejects wrong denomination, missing entry, invalid height, jailed and expired entries", () => {
    expect(() =>
      validateCancellation(snapshot(), { ...message(), amount: { denom: "other", amount: "1" } }),
    ).toThrow("denomination");
    expect(() => validateCancellation({ ...snapshot(), entries: [] }, message())).toThrow(
      "no longer exists",
    );
    expect(() =>
      validateCancellation(snapshot(), {
        ...message(),
        creationHeight: BigInt("9223372036854775808"),
      }),
    ).toThrow("height");
    const jailed = snapshot();
    jailed.entries[0].unavailableReason = "Validator is jailed";
    expect(() => validateCancellation(jailed, message())).toThrow("jailed");
    expect(() => validateCancellation(snapshot(), message(), 10000)).toThrow("completed");
  });
});

describe("live preflight and pagination", () => {
  const disconnect = jest.fn();
  const page = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    (connectComet as jest.Mock).mockResolvedValue({
      disconnect,
      block: async () => ({ block: { header: { time: new Date(1000) } } }),
    });
    page.mockResolvedValue({
      unbondingResponses: [
        {
          validatorAddress: "lavavaloper1test",
          entries: [
            {
              creationHeight: BigInt("9007199254740993"),
              balance: "1000000",
              completionTime: { seconds: BigInt(10), nanos: 0 },
            },
          ],
        },
      ],
    });
    jest
      .spyOn(QueryClient, "withExtensions")
      .mockReturnValue({
        staking: {
          params: async () => ({ params: { bondDenom: "ulava" } }),
          validator: async () => ({
            validator: {
              description: { moniker: "Validator" },
              jailed: false,
              tokens: "1",
              delegatorShares: "1",
            },
          }),
          delegatorUnbondingDelegations: page,
        },
      } as unknown as ReturnType<typeof QueryClient.withExtensions>);
  });
  afterEach(() => jest.restoreAllMocks());
  it("loads every page and disconnects", async () => {
    page.mockResolvedValueOnce({
      unbondingResponses: [],
      pagination: { nextKey: new Uint8Array([1]) },
    });
    expect((await getUnbondingSnapshot("rpc", "lava@test")).entries).toEqual(snapshot().entries);
    expect(page).toHaveBeenNthCalledWith(2, "lava@test", new Uint8Array([1]));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
  it("disconnects on query failure", async () => {
    page.mockRejectedValueOnce(new Error("RPC unavailable"));
    await expect(getUnbondingSnapshot("rpc", "lava@test")).rejects.toThrow("RPC unavailable");
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
  it("rejects aggregate overdraw and incorrect delegators", async () => {
    const encoded = { typeUrl: MsgTypeUrls.CancelUnbondingDelegation, value: message("600000") };
    await expect(
      validateCancelUnbondingMessages("rpc", [encoded, encoded], "lava@test"),
    ).rejects.toThrow("exceeds");
    await expect(validateCancelUnbondingMessages("rpc", [encoded], "lava@other")).rejects.toThrow(
      "delegator",
    );
  });
  it("does not query for unrelated messages", async () => {
    await validateCancelUnbondingMessages("rpc", [], "lava@test");
    expect(connectComet).not.toHaveBeenCalled();
  });
});
