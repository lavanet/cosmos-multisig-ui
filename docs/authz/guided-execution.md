# Execute grants with a multisig

Open **New Transaction** and choose an action from **On behalf of another wallet**, alongside the other transaction modules. The multisig is the **grantee**: its members sign, its account sequence is used, and it pays transaction fees. The selected **granter** owns the tokens/delegations and must already have authorized the multisig.

1. Choose the transaction type, then select a granter from the wallet dropdown in the same inline form. It automatically lists only wallets with an active supported grant for that exact action. Use **Refresh wallets** to query again.
2. Selecting a wallet automatically loads its permissions and balances. The screen shows grant expiration, remaining allowance, allowed recipients and validator restrictions. Unsupported and expired grants cannot enable actions.
3. Complete the selected action. Use **Add another action** to build a batch in execution order; remove or move actions up as needed.
4. **Review and simulate** checks fresh chain state and simulates the entire batch. Review the granter, recipients, validators/providers, amounts, vote, gas and multisig fee.
5. **Create unsigned proposal** saves the reviewed transaction. Share the proposal with the multisig members. Saving does not sign or broadcast it.

## Supported guided actions

| Action | Inner message | Required authorization |
| --- | --- | --- |
| Transfer LAVA or another bank token | `/cosmos.bank.v1beta1.MsgSend` | GenericAuthorization or SendAuthorization |
| Vote | `/cosmos.gov.v1.MsgVote` | GenericAuthorization for this exact URL |
| Vote (legacy grant) | `/cosmos.gov.v1beta1.MsgVote` | GenericAuthorization for this exact URL |
| Claim delegation rewards | `/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward` | GenericAuthorization |
| Delegate to validator | `/cosmos.staking.v1beta1.MsgDelegate` | GenericAuthorization or StakeAuthorization with DELEGATE |
| Redelegate between validators | `/cosmos.staking.v1beta1.MsgBeginRedelegate` | GenericAuthorization or StakeAuthorization with REDELEGATE |
| Lava dualstaking delegation | `/lavanet.lava.dualstaking.MsgDelegate` | GenericAuthorization |
| Lava dualstaking redelegation | `/lavanet.lava.dualstaking.MsgRedelegate` | GenericAuthorization |
| Claim Lava dualstaking rewards | `/lavanet.lava.dualstaking.MsgClaimRewards` | GenericAuthorization |
| Staking unbond | `/cosmos.staking.v1beta1.MsgUndelegate` | GenericAuthorization or StakeAuthorization with UNDELEGATE |
| Lava dualstaking unbond | `/lavanet.lava.dualstaking.MsgUnbond` | GenericAuthorization |

Reward rows have individual checkboxes and **Select all**. Each selected validator becomes one inner message. Rewards are sent to the granter's configured withdrawal address, which can differ from both the granter and the multisig. Amounts are determined at execution.

Transfers use **spendable** balances, including vesting restrictions. Known tokens use their registered display units; unknown denominations explicitly use integer base units. This supports bank-held IBC denominations, not cross-chain IBC transfers.

Delegation selects a destination validator; restricted staking grants filter the destination choices. Dualstaking delegation also requires a provider address and stakes new tokens with a validator. Delegation uses the bank balance, which may include locked vesting tokens eligible for staking; it does not remove vesting locks. Transfers still use spendable balances. Both draw from a shared bank budget in a batch, and simulation enforces the account's staking restrictions.

Validator redelegation selects an existing source delegation and a different destination validator. Provider redelegation selects an existing provider allocation and a destination provider address; it does not add validator stake. These actions share source budgets with unbonding. Simulation checks redelegation cooldowns, provider eligibility and chain-specific limits. A batch cannot rely on stake or allocations created by an earlier action to fund a later action.

Dualstaking rewards may be claimed from a specific provider, or from all providers by leaving the optional provider field blank. This includes rewards from previous allocations; the UI does not limit claims to current provider delegations. Rewards are paid to the granter, with amounts determined at execution.

Unbond actions start an unbonding period; they do not immediately transfer tokens. On Lava, ordinary staking undelegation can affect provider allocations. Dualstaking unbond requires both a validator and a provider; provider queries do not identify a specific validator pairing. The complete simulation verifies the actual chain behavior. Vesting locks remain applicable.

Votes list proposals currently in voting and require an explicit option. A new vote may replace the granter's earlier vote. The two governance message versions are distinct permissions; the UI never substitutes one for the other.

## Batching and freshness

The guided builder uses one granter and one outer `MsgExec` containing ordered actions (up to 100 inner messages). This is an application limit, not a Ledger compatibility promise. All actions execute atomically; if execution fails, their state changes roll back, but fees and the account sequence may still be consumed.

Grant allowance and resource checks aggregate amounts across the batch. They conservatively reject spending funds that would only become available from an earlier action in the same batch. Simulation is required before review, saving, signing and broadcast. Grant revocation, expiry, state changes or another multisig transaction can invalidate a proposal while signatures are being collected. Create a replacement proposal when its sequence, messages or fees need to change.

The initial gas estimate simulates the real multisig public key with dummy signatures for every member, then adds a 40% margin. Actual signed bytes are simulated before broadcast. A higher fee or gas limit never bypasses grant or signature validation.

## Signing and stored data

Every signer must sign the same chain, multisig account number/sequence, fee, memo and nested actions. Wallet modifications are rejected. Only cryptographically valid, distinct multisig member signatures over the canonical proposal count toward quorum. Stored body bytes cannot replace the reviewed transaction. The public key must derive the route's multisig address.

A saved hash alone is not proof of completion: the page queries chain inclusion, execution code, body and sequence. Nonzero execution codes are shown as failures. If a broadcast times out, its outcome can be unknown: inspect the chain before retrying; the account sequence is checked again before broadcast.

The API validates proposal/signature shapes and sizes, and database requests use GraphQL variables. These endpoints remain public; this change does not add authentication, rate limiting, or make the database trusted. Signature verification and chain validation remain necessary.

## Existing JSON imports

The examples in this directory remain supported, including delegate, redelegate and dualstaking reward actions, which also have guided forms. Imported executions may contain multiple granters and multiple `MsgExec` envelopes, but every envelope must use the current multisig as grantee. All affected granters are checked before signing.

Inner `value` objects use the documented camelCase JSON format, not base64 protobuf Any payloads. Amounts and proposal IDs are strings. Empty batches, unknown/nested actions, invalid addresses, extra fields, and mixed ordinary + authz messages are rejected. Files are limited to 1 MB. The redelegation example's old invalid placeholder destination has been replaced with a valid-format example address; replace examples with your intended addresses.

## Validation and remaining manual checks

Automated tests cover documented JSON roundtrips, both vote versions, exact integers, grant restrictions, cumulative budgets, vesting spendable balance, shared unbond budgets, pagination, snapshot failures, form selection/reset, revoked-grant failures, API validation and GraphQL parameterization. Offline tests sign all supported actions and a combined batch with a 2-of-3 multisig; forged, duplicate, outsider and mismatched signatures are rejected. Ordinary transaction and cancel-unbonding tests remain in the suite.

Run `npm run test:ci -- --runInBand`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

Optional read-only mainnet smoke test:

```sh
LAVA_AUTHZ_LIVE_TEST=1 npm run test:ci -- --runInBand live.integration
```

It reads public grants and simulates an existing authorized reward claim with dummy signatures. It never signs or broadcasts. It uses a public single-key grantee as a chain fixture; it does not replace an end-to-end on-chain multisig test. The fixture may change as grants and balances change.

A second opt-in harness creates a disposable private Lava 6.2.4 chain with deterministic **test-only** keys, signs and broadcasts real 2-of-3 multisig transactions, then stops its node:

```sh
LAVA_AUTHZ_LOCAL_BINARY=/absolute/path/to/lavad npm run test:ci -- --runInBand local.integration
```

Use the official v6.2.4 binary; the harness checks the version. Ports 29656, 29657 and 29690 must be free. All listeners bind to loopback. It creates a new temporary node home and never uses your wallet/keyring or a public chain. It covers LAVA and a second bank denomination, both governance versions (including empty/nonempty metadata), reward claims, staking unbond, dualstaking unbond, changed sequence and revoked grants. Resulting token balances, votes and validator delegation amounts are checked. It also executes validator delegation and an all-provider dualstaking reward claim, and checks rejection of unregistered provider destinations. The dualstaking fixture exercises the chain's `empty_provider` allocation; a registered provider remains a manual integration case.

All 11 action types accepted by the authz message validator now have guided forms. This does not enable every standalone transaction module through authz: IBC, contract calls, vesting-account creation, cancel-unbonding, withdrawal-address changes and grant management remain outside this authz allowlist. Adding them requires separate message validation, signing and chain-execution coverage.

Before production release, manually verify the deployed UI, grant expiry during signature collection, and unbonding from a registered provider. Test Keplr and physical Ledger hardware, recording device/app versions. The displayed signing-document size is diagnostic; no fixed size guarantees that every Ledger model/app can parse or display every nested message. The tool never automatically splits a batch into multiple transactions or assigns future sequences.
