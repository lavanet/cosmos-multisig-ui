/** @jest-environment node */
import { connectComet } from "@cosmjs/tendermint-rpc";
import { collectPages, withAuthzQuery } from "./queries";
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
