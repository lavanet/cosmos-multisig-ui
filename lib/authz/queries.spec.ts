/** @jest-environment node */
import { connectComet } from "@cosmjs/tendermint-rpc";
import { collectPages, discoverGranters, loadAuthzAccount, withAuthzQuery } from "./queries";
import { GenericAuthorization, GrantAuthorization } from "cosmjs-types/cosmos/authz/v1beta1/authz";
import {
  QueryGrantsResponse,
  QueryGranteeGrantsResponse,
} from "cosmjs-types/cosmos/authz/v1beta1/query";
import { toBech32 } from "@cosmjs/encoding";
import { QueryAllBalancesResponse } from "cosmjs-types/cosmos/bank/v1beta1/query";
import { QueryParamsResponse } from "cosmjs-types/cosmos/staking/v1beta1/query";
import { MsgTypeUrls } from "../../types/txMsg";
jest.mock("@cosmjs/tendermint-rpc", () => ({ connectComet: jest.fn() }));
it("collects all pages and follows exact continuation keys", async () => {
  const query = jest
    .fn()
    .mockResolvedValueOnce({ items: [1], nextKey: Uint8Array.from([7]) })
    .mockResolvedValueOnce({ items: [2] });
  expect(await collectPages(query)).toEqual([1, 2]);
  expect(query.mock.calls[1][0].key).toEqual(Uint8Array.from([7]));
});
it("rejects repeated pagination and does not return partial results after errors", async () => {
  await expect(
    collectPages(async () => ({ items: [1], nextKey: Uint8Array.from([7]) })),
  ).rejects.toThrow(/Repeated/);
  const query = jest
    .fn()
    .mockResolvedValueOnce({ items: [1], nextKey: Uint8Array.from([7]) })
    .mockRejectedValueOnce(new Error("unavailable"));
  await expect(collectPages(query)).rejects.toThrow(/unavailable/);
});
it("pins chain queries to a consistent height and disconnects", async () => {
  const client = {
    status: jest.fn().mockResolvedValue({
      nodeInfo: { network: "lava" },
      syncInfo: { catchingUp: false, latestBlockHeight: 123, latestBlockTime: new Date(1000) },
    }),
    abciQuery: jest.fn().mockResolvedValue({ height: 123, code: 0, value: Uint8Array.from([1]) }),
    disconnect: jest.fn(),
  };
  jest
    .mocked(connectComet)
    .mockResolvedValue(client as unknown as Awaited<ReturnType<typeof connectComet>>);
  await expect(
    withAuthzQuery("rpc", "lava", (rpc) => rpc.request("service", "Method", new Uint8Array())),
  ).resolves.toEqual(Uint8Array.from([1]));
  expect(client.abciQuery).toHaveBeenCalledWith({
    path: "/service/Method",
    height: 123,
    data: new Uint8Array(),
  });
  expect(client.disconnect).toHaveBeenCalledTimes(1);
  await expect(withAuthzQuery("rpc", "other", async () => null)).rejects.toThrow(/different chain/);
  client.abciQuery.mockResolvedValue({ height: 122, code: 0 });
  await expect(
    withAuthzQuery("rpc", "lava", (rpc) => rpc.request("service", "Method", new Uint8Array())),
  ).rejects.toThrow(/snapshot/);
  expect(client.disconnect).toHaveBeenCalledTimes(3);
});

it("discovers unique wallets across pages with active grants for the exact action", async () => {
  const grant = (granter: string, msg: string = MsgTypeUrls.Send, seconds?: bigint) =>
    GrantAuthorization.fromPartial({
      granter,
      grantee: "multisig",
      authorization: {
        typeUrl: "/cosmos.authz.v1beta1.GenericAuthorization",
        value: GenericAuthorization.encode({ msg }).finish(),
      },
      expiration: seconds === undefined ? undefined : { seconds, nanos: 0 },
    });
  const page = (grants: GrantAuthorization[], nextKey = new Uint8Array()) => ({
    height: 123,
    code: 0,
    value: QueryGranteeGrantsResponse.encode({
      grants,
      pagination: { nextKey, total: 0n },
    }).finish(),
  });
  const client = {
    status: jest.fn().mockResolvedValue({
      nodeInfo: { network: "lava" },
      syncInfo: { catchingUp: false, latestBlockHeight: 123, latestBlockTime: new Date(1000) },
    }),
    abciQuery: jest
      .fn()
      .mockResolvedValueOnce(
        page(
          [
            grant("wallet-b"),
            grant("expired", MsgTypeUrls.Send, 1n),
            grant("unrelated", MsgTypeUrls.Vote),
            {
              ...grant("unsupported"),
              authorization: { typeUrl: "unknown", value: new Uint8Array() },
            },
          ],
          Uint8Array.from([7]),
        ),
      )
      .mockResolvedValueOnce(page([grant("wallet-b"), grant("wallet-a", MsgTypeUrls.Send, 2n)])),
    disconnect: jest.fn(),
  };
  jest
    .mocked(connectComet)
    .mockResolvedValue(client as unknown as Awaited<ReturnType<typeof connectComet>>);
  await expect(discoverGranters("rpc", "lava", "multisig", MsgTypeUrls.Send)).resolves.toEqual([
    "wallet-a",
    "wallet-b",
  ]);
  expect(client.abciQuery).toHaveBeenCalledTimes(2);
  expect(client.disconnect).toHaveBeenCalledTimes(1);
});

it.each([MsgTypeUrls.Delegate, MsgTypeUrls.DualDelegate])(
  "loads full bank balances for staking-only permission %s",
  async (msg) => {
    const actor = toBech32("lava@", new Uint8Array(20).fill(1));
    const responses: Record<string, Uint8Array> = {
      "/cosmos.authz.v1beta1.Query/Grants": QueryGrantsResponse.encode({
        grants: [
          {
            authorization: {
              typeUrl: "/cosmos.authz.v1beta1.GenericAuthorization",
              value: GenericAuthorization.encode({ msg }).finish(),
            },
          },
        ],
      }).finish(),
      "/cosmos.staking.v1beta1.Query/Params": QueryParamsResponse.encode(
        QueryParamsResponse.fromPartial({ params: { bondDenom: "ulava" } }),
      ).finish(),
      "/cosmos.bank.v1beta1.Query/AllBalances": QueryAllBalancesResponse.encode({
        balances: [{ denom: "ulava", amount: "100" }],
      }).finish(),
    };
    const client = {
      status: jest
        .fn()
        .mockResolvedValue({
          nodeInfo: { network: "lava" },
          syncInfo: { catchingUp: false, latestBlockHeight: 123, latestBlockTime: new Date(1000) },
        }),
      abciQuery: jest.fn().mockImplementation(async ({ path }: { path: string }) => {
        if (!responses[path]) throw new Error(`Unexpected query ${path}`);
        return { height: 123, code: 0, value: responses[path] };
      }),
      disconnect: jest.fn(),
    };
    jest
      .mocked(connectComet)
      .mockResolvedValue(client as unknown as Awaited<ReturnType<typeof connectComet>>);
    const account = await loadAuthzAccount("rpc", "lava", "lava@", actor, actor);
    expect(account.stakingBalance).toEqual([{ denom: "ulava", amount: "100" }]);
    expect(account.spendable).toEqual([]);
    expect(client.abciQuery).toHaveBeenCalledTimes(3);
  },
);
