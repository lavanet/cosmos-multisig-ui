# Private Lava RPC

Set `LAVA_RPC_URL` to the HTTPS Tendermint HTTP endpoint as a **Secret** in the deployment environment. For local development use an ignored `.env.local`. Never put this value in `NEXT_PUBLIC_*`, a query parameter, source code, or the chain editor.

Rebuild after setting or removing this variable. The build exposes only a boolean feature flag. When configured, Lava uses the absolute same-origin `/api/rpc/lava` address by default, replacing a cached node selection. Other chains keep their existing configuration. Explicit custom RPC URL parameters remain supported and override defaults.

The API route reads the endpoint only on the server. It accepts individual JSON-RPC POST requests for the CosmJS methods used by the tool, forwards a canonical request without browser headers/cookies, disallows redirects, and limits request size, response size and upstream duration. Unsupported methods and batches are rejected. HTTP failures and JSON-RPC transport errors become generic errors; upstream headers and exception messages are never returned or logged. Endpoint components are also redacted from successful JSON responses. ABCI application results remain available so normal simulation and transaction validation work.

This hides the provider URL; it is not authentication for the proxy. The same-origin route is callable by anyone who can access the deployment. Cross-site browser requests are rejected, but this does not stop scripts outside a browser. Keep preview deployment protection enabled and apply platform rate limits/provider quotas before exposing it publicly. The route does not hold wallet keys or sign transactions; broadcasts require already-signed transaction bytes.

Preview secrets can be scoped to the PR branch. Configure the secret separately for Production before releasing this default there. Environment changes alone do not update existing builds.

Validation: `npm run test:ci -- --runInBand lib/lavaRpc.spec.ts`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`. Build using a dummy endpoint and check `.next/static` and generated HTML/JSON for its sentinel token to verify that the secret is absent from browser artifacts.
