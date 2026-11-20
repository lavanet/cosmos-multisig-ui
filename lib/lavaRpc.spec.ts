/** @jest-environment node */
import handler from "../pages/api/rpc/lava";
import type { NextApiRequest, NextApiResponse } from "next";

const secret = "https://private.example/gateway/0123456789abcdef0123456789abcdef";
const request = { jsonrpc: "2.0", id: 1, method: "status", params: {} };
const originalFetch = global.fetch;
const originalEndpoint = process.env.LAVA_RPC_URL;
let fetchMock: jest.Mock;

function response() {
  const res = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn(), send: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
async function call(body: unknown = request, method = "POST", headers = {}) {
  const res = response();
  await handler({ body, method, headers } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
}
function upstream(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200 });
}
beforeEach(() => {
  process.env.LAVA_RPC_URL = secret;
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});
afterEach(() => {
  global.fetch = originalFetch;
  if (originalEndpoint === undefined) delete process.env.LAVA_RPC_URL;
  else process.env.LAVA_RPC_URL = originalEndpoint;
});

test("forwards only canonical JSON-RPC fields and no browser credentials", async () => {
  fetchMock.mockResolvedValue(upstream({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
  const res = await call({ ...request, url: "https://evil.example", extra: "ignored" });
  expect(String(fetchMock.mock.calls[0][0])).toBe(secret);
  const options = fetchMock.mock.calls[0][1];
  expect(options.redirect).toBe("error");
  expect(options.headers).toEqual({ "Content-Type": "application/json" });
  expect(JSON.parse(options.body)).toEqual(request);
  expect(JSON.parse(res.send.mock.calls[0][0]).result).toEqual({ ok: true });
  expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
});

test.each(["abci_query", "tx", "broadcast_tx_sync"])("supports CosmJS %s", async (method) => {
  fetchMock.mockResolvedValue(upstream({ jsonrpc: "2.0", result: {} }));
  const res = await call({ ...request, method });
  expect(res.status).toHaveBeenCalledWith(200);
});

test.each([
  [request],
  { ...request, method: "unsafe_flush_mempool" },
  { ...request, id: null },
  { ...request, params: [] },
])("rejects unsupported requests", async (body) => {
  const res = await call(body);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects GET and cross-site requests", async () => {
  expect((await call(request, "GET")).status).toHaveBeenCalledWith(405);
  expect(
    (await call(request, "POST", { "sec-fetch-site": "cross-site" })).status,
  ).toHaveBeenCalledWith(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("fails closed when the secret is absent or insecure", async () => {
  delete process.env.LAVA_RPC_URL;
  expect((await call()).status).toHaveBeenCalledWith(503);
  process.env.LAVA_RPC_URL = "http://private.example";
  expect((await call()).status).toHaveBeenCalledWith(503);
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each(["throw", "rpc", "http", "invalid"])("hides endpoint from %s errors", async (mode) => {
  if (mode === "throw") fetchMock.mockRejectedValue(new Error(secret));
  if (mode === "rpc")
    {fetchMock.mockResolvedValue(upstream({ jsonrpc: "2.0", error: { message: secret } }));}
  if (mode === "http") fetchMock.mockResolvedValue(new Response(secret, { status: 500 }));
  if (mode === "invalid") fetchMock.mockResolvedValue(new Response(secret));
  const res = await call();
  expect(res.status).toHaveBeenCalledWith(502);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain("private.example");
  expect(res.send).not.toHaveBeenCalled();
});

test("redacts private URL and token from successful nested results", async () => {
  const token = secret.split("/").pop();
  fetchMock.mockResolvedValue(
    upstream({
      jsonrpc: "2.0",
      result: { log: secret, nested: [token, encodeURIComponent(secret)] },
    }),
  );
  const res = await call();
  const sent = res.send.mock.calls[0][0];
  expect(sent).not.toContain("private.example");
  expect(sent).not.toContain(token);
});

test("bounds upstream response size", async () => {
  fetchMock.mockResolvedValue(new Response("x".repeat(4 * 1024 * 1024 + 1)));
  expect((await call()).status).toHaveBeenCalledWith(502);
});

test("aborts a slow upstream without leaking an error", async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error(secret)));
      }),
  );
  const pending = call();
  await jest.advanceTimersByTimeAsync(15000);
  expect((await pending).status).toHaveBeenCalledWith(502);
  jest.useRealTimers();
});
