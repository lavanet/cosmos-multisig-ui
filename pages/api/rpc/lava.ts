import type { NextApiRequest, NextApiResponse } from "next";

export const config = { api: { bodyParser: { sizeLimit: "256kb" }, responseLimit: "4mb" } };

// Only the HTTP methods used by CosmJS. No arbitrary URL, websocket subscriptions,
// administrative RPCs, or JSON-RPC batches are accepted.
const methods = new Set([
  "status",
  "abci_query",
  "block",
  "block_results",
  "commit",
  "validators",
  "tx",
  "tx_search",
  "broadcast_tx_sync",
]);
const maxResponseBytes = 4 * 1024 * 1024;

export default async function lavaRpc(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  // CORS is intentionally not enabled. Reject cross-site browser requests too.
  if (req.headers["sec-fetch-site"] === "cross-site") {
    return res.status(403).json({ error: "Cross-site requests are not allowed" });
  }
  const body = req.body;
  if (
    !body ||
    Array.isArray(body) ||
    body.jsonrpc !== "2.0" ||
    !methods.has(body.method) ||
    !(
      typeof body.id === "string" ||
      (typeof body.id === "number" && Number.isSafeInteger(body.id))
    ) ||
    (body.params !== undefined &&
      (!body.params || typeof body.params !== "object" || Array.isArray(body.params)))
  ) {
    return res.status(400).json({ error: "Invalid or unsupported RPC request" });
  }
  const fail = (status: number) =>
    res.status(status).json({
      jsonrpc: "2.0",
      id: body.id,
      error: { code: -32603, message: "Lava RPC request failed. Please try again." },
    });
  const endpoint = process.env.LAVA_RPC_URL;
  if (!endpoint) return fail(503);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return fail(503);
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        method: body.method,
        params: body.params ?? {},
      }),
      redirect: "error",
      signal: controller.signal,
    });
    if (!upstream.ok || !upstream.body) return fail(502);
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxResponseBytes) {
        await reader.cancel();
        return fail(502);
      }
      chunks.push(value);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    // Never forward transport errors, provider diagnostics, or headers.
    if (result.jsonrpc !== "2.0" || result.error || !Object.hasOwn(result, "result"))
      {return fail(502);}
    // Defense in depth for providers that echo endpoint information in a result.
    const privateParts = [
      endpoint,
      url.host,
      ...url.pathname.split("/").filter((part) => part.length >= 16),
      ...Array.from(url.searchParams.values()),
    ].filter(Boolean);
    const payload = JSON.stringify(
      { jsonrpc: "2.0", id: body.id, result: result.result },
      (_key, value) => {
        if (typeof value !== "string") return value;
        let safe = value;
        for (const part of privateParts) {
          safe = safe
            .split(part)
            .join("[redacted]")
            .split(encodeURIComponent(part))
            .join("[redacted]");
        }
        return safe;
      },
    );
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(payload);
  } catch {
    // Deliberately do not log exceptions: fetch errors may contain the private URL.
    return fail(502);
  } finally {
    clearTimeout(timeout);
  }
}
