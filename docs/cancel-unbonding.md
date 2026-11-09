# Cancel unbonding

Under **Create New Transaction → Staking → Cancel unbonding**, select one pending
unbonding entry. Each option shows the validator, remaining balance, completion
time, and creation height. The selected-entry summary includes the full validator
address. The amount defaults to the full remaining balance; enter a smaller amount
to cancel partially. Tokens return to delegation with the same validator.

Other unbonding entries are unaffected. Add more cancellation messages to cancel
multiple entries. The combined requested amount for any one entry cannot exceed
its current balance.

The picker queries all unbonding pages and each relevant validator, rather than
limiting selection to the bonded validator list. Unavailable, jailed, invalid-rate,
and completed entries cannot be canceled. Refresh entries to fetch current data.
The app checks the chain again before saving a proposal and before broadcasting.
If an entry has completed or its balance has fallen, create a new proposal with
valid fields and collect signatures again. Signed messages are never adjusted.
The chain remains authoritative: state can change after a successful preflight.

## Message import

Use the existing JSON-array import format. Amounts are integer base units and
`creationHeight` is a decimal string, never a JavaScript number. Replace the
placeholders with an actual multisig, validator, and entry height:

```json
[
  {
    "typeUrl": "/cosmos.staking.v1beta1.MsgCancelUnbondingDelegation",
    "value": {
      "delegatorAddress": "<multisig address>",
      "validatorAddress": "<validator operator address>",
      "creationHeight": "123456",
      "amount": { "denom": "ulava", "amount": "1000000" }
    }
  }
]
```

Imported entries must still exist on chain. The form preserves imported partial
amounts. The codec serializes heights as strings for storage and restores them as
`bigint`. CosmJS 0.33's existing staking registry and default Amino converter handle
encoding/signing; no custom converter, SDK upgrade, or database migration is needed.
This action is a direct staking message; this change does not add nested authz
`MsgExec` support.

## Validation

```sh
npm ci
npm run test:ci -- --runInBand
npm run lint
npx tsc --noEmit
npm run build
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Tests cover pagination/cleanup, full and partial cancellation, stale/missing
entries, jailed validators, invalid amounts/denominations/heights, cumulative
balance checks, picker interactions/retry/import, exact JSON/protobuf/Amino round
trips, and offline 2-of-2 multisig signing/assembly.

On 2026-11-09, read-only Lava mainnet checks retrieved 19 pending entries for the
supplied multisig. Cosmos `Simulate` accepted both partial and full cancellation
of entry height 6159752, using 306,874 and 305,494 gas respectively. The default is
400,000 per cancellation plus the existing 100,000 transaction overhead; actual
gas depends on validator state and message composition. No transaction was
broadcast. Browser checks confirmed selection, exact balance defaults, partial
editing, and excessive-amount rejection.

Saving proposals and collecting real wallet signatures require the deployment's
Dgraph configuration and participating wallets. Those external persistence and
wallet interactions were not exercised locally; signing was tested with ephemeral
test keys, and chain execution was tested through simulation only.
