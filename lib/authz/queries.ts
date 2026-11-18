import { connectComet } from "@cosmjs/tendermint-rpc";
import { QueryClientImpl as AuthzQuery } from "cosmjs-types/cosmos/authz/v1beta1/query";
import { QueryClientImpl as BankQuery } from "cosmjs-types/cosmos/bank/v1beta1/query";
import { QueryClientImpl as StakingQuery } from "cosmjs-types/cosmos/staking/v1beta1/query";
import { QueryClientImpl as DistributionQuery } from "cosmjs-types/cosmos/distribution/v1beta1/query";
import { QueryClientImpl as GovQuery } from "cosmjs-types/cosmos/gov/v1/query";
import { QueryClientImpl as DualQuery } from "@lavanet/lavajs/dist/codegen/lavanet/lava/dualstaking/query.rpc.Query";
import { ServiceClientImpl } from "cosmjs-types/cosmos/tx/v1beta1/service";
import { Coin } from "@cosmjs/amino";
import { PageRequest } from "cosmjs-types/cosmos/base/query/v1beta1/pagination";
import { Rpc } from "cosmjs-types/helpers";
import { decodeGrant, Permission, availablePermission } from "./grants";
import { checkAccount, VOTE_V1 } from "./messages";
import { MsgTypeUrls } from "../../types/txMsg";

export interface AuthzAccount {
  granter: string;
  grantee: string;
  height: number;
  time: number;
  permissions: Permission[];
  spendable: Coin[];
  bondDenom: string;
  delegations: { validator: string; amount: string }[];
  providers: { provider: string; amount: string }[];
  rewards: { validator: string; coins: Coin[] }[];
  withdrawAddress: string;
  proposals: { id: string; title: string; votingEnd: string }[];
}
export async function withAuthzQuery<T>(
  url: string,
  chainId: string,
  action: (rpc: Rpc, height: number, time: number) => Promise<T>,
): Promise<T> {
  const comet = await connectComet(url);
  try {
    const status = await comet.status();
    if (status.nodeInfo.network !== chainId || status.syncInfo.catchingUp) {
      throw new Error("RPC is on a different chain or catching up");
    }
    const height = status.syncInfo.latestBlockHeight;
    const time = status.syncInfo.latestBlockTime.getTime();
    const rpc: Rpc = {
      request: async (service, method, data) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            comet.abciQuery({ path: `/${service}/${method}`, data, height }),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("Chain query timed out. Retry.")), 20000);
            }),
          ]);
          if (result.code) throw new Error(result.log || "Chain query failed");
          if (result.height !== height) throw new Error("Inconsistent query snapshot");
          return result.value;
        } finally {
          clearTimeout(timer);
        }
      },
    };
    return await action(rpc, height, time);
  } finally {
    comet.disconnect();
  }
}
export async function collectPages<T>(
  fetch: (pagination: PageRequest) => Promise<{ items: T[]; nextKey?: Uint8Array }>,
): Promise<T[]> {
  let key = new Uint8Array();
  const seen = new Set<string>();
  const items: T[] = [];
  for (let page = 0; page < 200; page++) {
    const result = await fetch(PageRequest.fromPartial({ key, limit: BigInt(100) }));
    items.push(...result.items);
    if (!result.nextKey?.length) return items;
    key = result.nextKey;
    const cursor = Array.from(key).join(",");
    if (seen.has(cursor)) throw new Error("Repeated chain pagination cursor");
    seen.add(cursor);
  }
  throw new Error("Too many query pages. Enter a granter directly or narrow the request.");
}
export async function discoverGranters(
  url: string,
  chainId: string,
  grantee: string,
  typeUrl?: string,
): Promise<string[]> {
  return withAuthzQuery(url, chainId, async (rpc, _, time) => {
    const query = new AuthzQuery(rpc);
    const grants = await collectPages(async (pagination) => {
      const r = await query.GranteeGrants({ grantee, pagination });
      return { items: r.grants, nextKey: r.pagination?.nextKey };
    });
    return Array.from(
      new Set(
        grants
          .filter((g) => {
            const p = decodeGrant(g);
            return (
              p.kind !== "unsupported" &&
              (!typeUrl || p.typeUrl === typeUrl) &&
              (p.expires === undefined || p.expires > time)
            );
          })
          .map((g) => g.granter),
      ),
    ).sort();
  });
}
export async function loadAuthzAccount(
  url: string,
  chainId: string,
  prefix: string,
  granter: string,
  grantee: string,
): Promise<AuthzAccount> {
  checkAccount(granter, prefix);
  checkAccount(grantee, prefix);
  return withAuthzQuery(url, chainId, async (rpc, height, time) => {
    const authz = new AuthzQuery(rpc),
      bank = new BankQuery(rpc),
      staking = new StakingQuery(rpc),
      distribution = new DistributionQuery(rpc);
    const grants = await collectPages(async (pagination) => {
      const r = await authz.Grants({ granter, grantee, msgTypeUrl: "", pagination });
      return { items: r.grants, nextKey: r.pagination?.nextKey };
    });
    const permissions = grants.map(decodeGrant);
    const can = (type: string) => !!availablePermission(permissions, type, time);
    const needsStake = can(MsgTypeUrls.Undelegate) || can(MsgTypeUrls.DualUnbond);
    const [spendable, params, delegations, rewardResponse, withdrawal, providers, proposals] =
      await Promise.all([
        can(MsgTypeUrls.Send)
          ? collectPages(async (pagination) => {
              const r = await bank.SpendableBalances({ address: granter, pagination });
              return { items: r.balances, nextKey: r.pagination?.nextKey };
            })
          : [],
        staking.Params({}),
        needsStake
          ? collectPages(async (pagination) => {
              const r = await staking.DelegatorDelegations({ delegatorAddr: granter, pagination });
              return { items: r.delegationResponses, nextKey: r.pagination?.nextKey };
            })
          : [],
        can(MsgTypeUrls.WithdrawDelegatorReward)
          ? distribution.DelegationTotalRewards({ delegatorAddress: granter })
          : undefined,
        can(MsgTypeUrls.WithdrawDelegatorReward)
          ? distribution.DelegatorWithdrawAddress({ delegatorAddress: granter })
          : undefined,
        can(MsgTypeUrls.DualUnbond)
          ? new DualQuery(rpc).delegatorProviders({ delegator: granter, withPending: false })
          : undefined,
        can(MsgTypeUrls.Vote) || can(VOTE_V1)
          ? collectPages(async (pagination) => {
              const r = await new GovQuery(rpc).Proposals({
                proposalStatus: 2,
                voter: "",
                depositor: "",
                pagination,
              });
              return { items: r.proposals, nextKey: r.pagination?.nextKey };
            })
          : [],
      ]);
    return {
      granter,
      grantee,
      height,
      time,
      permissions,
      spendable,
      bondDenom: params.params?.bondDenom || "",
      delegations: delegations
        .filter((d) => d.delegation && d.balance)
        .map((d) => ({ validator: d.delegation!.validatorAddress, amount: d.balance!.amount })),
      providers: (providers?.delegations || []).map((d) => ({
        provider: d.provider,
        amount: d.amount?.amount || "0",
      })),
      rewards: (rewardResponse?.rewards || []).map((r) => ({
        validator: r.validatorAddress,
        coins: r.reward,
      })),
      withdrawAddress: withdrawal?.withdrawAddress || granter,
      proposals: proposals.map((p) => ({
        id: p.id.toString(),
        title: p.title || `Proposal ${p.id}`,
        votingEnd: p.votingEndTime
          ? new Date(Number(p.votingEndTime.seconds) * 1000).toISOString()
          : "",
      })),
    };
  });
}
export async function simulateBytes(
  url: string,
  chainId: string,
  txBytes: Uint8Array,
): Promise<number> {
  return withAuthzQuery(url, chainId, async (rpc) => {
    const result = await new ServiceClientImpl(rpc).Simulate({ txBytes });
    const gas = Number(result.gasInfo?.gasUsed);
    if (!Number.isSafeInteger(gas) || gas <= 0) throw new Error("Invalid simulation gas response");
    return gas;
  });
}
