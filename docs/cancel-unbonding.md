# Cancel unbonding

Under **Create New Transaction → Staking → Cancel unbonding**, use the checkboxes
to select individual pending entries, all entries for one validator, or all
available entries. Each row shows the balance, completion time, and creation
height; each validator group includes its full address. Selected amounts default
to the full balance and can be edited for partial cancellation. The summary shows
the selected entry/message count and total amount returning to staking.

Selected entries become separate cancellation messages in one multisig proposal.
Unselected entries are unaffected. The combined requested amount for any one
entry cannot exceed its current balance, even across multiple cancellation forms.
The batch is atomic: if one message fails on chain, none of the cancellations
execute. Clear selection resets the batch, including stale entries after refresh.

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
balance checks, checkbox selection across validators/retry/import, exact
JSON/protobuf/Amino round trips, and offline 2-of-2 multisig signing/assembly for
one and 19 messages. Parent-form integration tests run in React StrictMode and
verify all 19 messages are saved in one proposal, stale batches are blocked, and
gas updates correctly on selection, deselection, and form removal.

On 2026-11-09, read-only Lava mainnet checks retrieved 19 pending entries for the
supplied multisig. Cosmos `Simulate` accepted both partial and full cancellation
of entry height 6159752, using 306,874 and 305,494 gas respectively. The default is
400,000 per cancellation plus the existing 100,000 transaction overhead; actual
gas depends on validator state and message composition. No transaction was
broadcast. Browser checks confirmed selection, exact balance defaults, partial
editing, and excessive-amount rejection. A separate read-only simulation of the
complete 19-entry batch succeeded at 4,181,399 gas, below the 7,700,000 default
estimate. This is a point-in-time check, not automatic gas simulation in the UI.

The UI currently uses the per-message gas estimate. It does not automatically
simulate batches, check Ledger payload/review limits, or split proposals into
smaller batches. Physical Ledger review/signing has not been tested. The measured
19-entry Amino payload was 5,475 bytes with an empty memo and sample fee; this does
not guarantee compatibility with every device or installed Cosmos app version.

Saving proposals and collecting real wallet signatures require the deployment's
Dgraph configuration and participating wallets. Those external persistence and
wallet interactions were not exercised locally; signing was tested with ephemeral
test keys, and chain execution was tested through simulation only.
