/** @jest-environment node */
// Opt in with LAVA_AUTHZ_LOCAL_BINARY=/absolute/path/to/lavad (v6.2.4).
// Creates a disposable private chain with deterministic TEST keys; never contacts mainnet.
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync, spawn, ChildProcess } from "child_process";
import {
  Secp256k1Wallet,
  createMultisigThresholdPubkey,
  encodeSecp256k1Pubkey,
  pubkeyToAddress,
  MultisigThresholdPubkey,
} from "@cosmjs/amino";
import {
  SigningStargateClient,
  StargateClient,
  makeMultisignedTxBytes,
  defaultRegistryTypes,
  AminoTypes,
  createDefaultAminoConverters,
} from "@cosmjs/stargate";
import { Registry } from "@cosmjs/proto-signing";
import { MsgRevoke } from "cosmjs-types/cosmos/authz/v1beta1/tx";
import { DbTransaction } from "../../types";
import { MsgTypeUrls } from "../../types/txMsg";
import { EXEC, VOTE_V1, execMessages } from "./messages";
import { QueryClientImpl as GovQuery } from "cosmjs-types/cosmos/gov/v1/query";
import { QueryClientImpl as StakingQuery } from "cosmjs-types/cosmos/staking/v1beta1/query";
import { loadAuthzAccount, withAuthzQuery } from "./queries";
import { preflightExec } from "./preflight";
import { authzAminoSign } from "../authzAminoSinger";
const suite = process.env.LAVA_AUTHZ_LOCAL_BINARY ? describe : describe.skip;
suite("private Lava chain authz integration", () => {
  const chainId = "lava-authz-local-test";
  const rpc = "http://127.0.0.1:29657";
  let home: string,
    child: ChildProcess,
    client: StargateClient,
    granterClient: SigningStargateClient;
  let wallets: Secp256k1Wallet[],
    pubkey: MultisigThresholdPubkey,
    grantee: string,
    granter: string,
    recipient: string,
    validator: string;
  const pause = () => new Promise((resolve) => setTimeout(resolve, 500));
  beforeAll(async () => {
    const binary = process.env.LAVA_AUTHZ_LOCAL_BINARY!;
    expect(execFileSync(binary, ["version"], { encoding: "utf8" }).trim()).toBe("6.2.4");
    home = mkdtempSync(join(tmpdir(), "lava-authz-test-"));
    const cli = (...args: string[]) =>
      execFileSync(binary, [...args, "--home", home], { stdio: "pipe" });
    cli("init", "authz-local", "--chain-id", chainId, "--default-denom", "ulava");
    cli("keys", "add", "validator", "--keyring-backend", "test");
    cli("add-genesis-account", "validator", "1000000000000000ulava", "--keyring-backend", "test");
    cli(
      "gentx",
      "validator",
      "100000000000ulava",
      "--chain-id",
      chainId,
      "--keyring-backend",
      "test",
    );
    cli("collect-gentxs");
    wallets = await Promise.all(
      [1, 2, 3, 4].map((n) => Secp256k1Wallet.fromKey(new Uint8Array(32).fill(n), "lava@")),
    );
    const accounts = await Promise.all(wallets.map(async (w) => (await w.getAccounts())[0]));
    pubkey = createMultisigThresholdPubkey(
      accounts.slice(0, 3).map((a) => encodeSecp256k1Pubkey(a.pubkey)),
      2,
    );
    grantee = pubkeyToAddress(pubkey, "lava@");
    granter = accounts[3].address;
    recipient = accounts[0].address;
    for (const address of [grantee, granter, recipient])
      {cli("add-genesis-account", address, "1000000000000ulava,1000000utest");}
    const path = join(home, "config/genesis.json");
    const genesis = JSON.parse(readFileSync(path, "utf8"));
    const types = [
      MsgTypeUrls.Send,
      MsgTypeUrls.Vote,
      VOTE_V1,
      MsgTypeUrls.WithdrawDelegatorReward,
      MsgTypeUrls.Undelegate,
      MsgTypeUrls.DualUnbond,
    ];
    genesis.app_state.authz.authorization = types.map((msg) => ({
      granter,
      grantee,
      authorization: { "@type": "/cosmos.authz.v1beta1.GenericAuthorization", msg },
      expiration: null,
    }));
    genesis.app_state.gov.starting_proposal_id = "2";
    genesis.app_state.gov.proposals = [
      {
        id: "1",
        messages: [],
        status: "PROPOSAL_STATUS_VOTING_PERIOD",
        final_tally_result: {
          yes_count: "0",
          abstain_count: "0",
          no_count: "0",
          no_with_veto_count: "0",
        },
        submit_time: new Date().toISOString(),
        deposit_end_time: new Date(Date.now() + 3600000).toISOString(),
        total_deposit: [{ denom: "ulava", amount: "10000000" }],
        voting_start_time: new Date().toISOString(),
        voting_end_time: new Date(Date.now() + 3600000).toISOString(),
        metadata: "",
        title: "Local authz vote",
        summary: "Local fixture",
        expedited: false,
      },
    ];
    writeFileSync(path, JSON.stringify(genesis));
    const configPath = join(home, "config/config.toml");
    writeFileSync(
      configPath,
      readFileSync(configPath, "utf8")
        .replace('timeout_commit = "5s"', 'timeout_commit = "1s"')
        .replace("pex = true", "pex = false"),
    );
    child = spawn(
      binary,
      [
        "start",
        "--home",
        home,
        "--rpc.laddr",
        "tcp://127.0.0.1:29657",
        "--p2p.laddr",
        "tcp://127.0.0.1:29656",
        "--grpc.address",
        "127.0.0.1:29690",
        "--grpc-web.enable=false",
        "--api.enable=false",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let logs = "";
    child.stderr!.on("data", (data) => {
      logs = (logs + data.toString()).slice(-12000);
    });
    for (let n = 0; n < 40; n++) {
      if (child.exitCode !== null) throw new Error(`Local node exited: ${logs}`);
      try {
        client = await StargateClient.connect(rpc);
        if ((await client.getHeight()) > 1) break;
        client.disconnect();
      } catch {
        /* wait for local genesis */
      }
      await pause();
    }
    expect(await client.getChainId()).toBe(chainId);
    validator = await withAuthzQuery(
      rpc,
      chainId,
      async (queryRpc) =>
        (await new StakingQuery(queryRpc).Validators({ status: "BOND_STATUS_BONDED" })).validators[0]
          .operatorAddress,
    );
    granterClient = await SigningStargateClient.connectWithSigner(rpc, wallets[3], {
      registry: new Registry([
        ...defaultRegistryTypes,
        ["/cosmos.authz.v1beta1.MsgRevoke", MsgRevoke],
      ]),
      aminoTypes: new AminoTypes({
        ...createDefaultAminoConverters(),
        "/cosmos.authz.v1beta1.MsgRevoke": {
          aminoType: "cosmos-sdk/MsgRevoke",
          toAmino: (v) => ({ granter: v.granter, grantee: v.grantee, msg_type_url: v.msgTypeUrl }),
          fromAmino: (v) => ({
            granter: v.granter,
            grantee: v.grantee,
            msgTypeUrl: v.msg_type_url,
          }),
        },
      }),
    });
    const result = await granterClient.signAndBroadcast(
      granter,
      [
        {
          typeUrl: MsgTypeUrls.Delegate,
          value: {
            delegatorAddress: granter,
            validatorAddress: validator,
            amount: { denom: "ulava", amount: "1000000000" },
          },
        },
      ],
      { gas: "1000000", amount: [{ denom: "ulava", amount: "10000" }] },
    );
    expect(result.code).toBe(0);
  }, 90000);
  afterAll(() => {
    client?.disconnect();
    granterClient?.disconnect();
    child?.kill("SIGTERM");
  });
  async function proposal(inner: DbTransaction["msgs"]) {
    const account = await client.getAccount(grantee);
    const tx: DbTransaction = {
      chainId,
      accountNumber: account!.accountNumber,
      sequence: account!.sequence,
      memo: "local authz test",
      fee: { gas: "3000000", amount: [{ denom: "ulava", amount: "10000" }] },
      msgs: [{ typeUrl: EXEC, value: { grantee, msgs: inner } }],
    };
    await preflightExec(rpc, "lava@", tx, pubkey);
    return tx;
  }
  async function execute(tx: DbTransaction) {
    const signed = await Promise.all(
      wallets
        .slice(0, 2)
        .map(async (wallet) =>
          authzAminoSign(
            (await wallet.getAccounts())[0].address,
            execMessages(tx.msgs),
            wallet,
            tx.fee,
            tx.memo,
            tx,
          ),
        ),
    );
    const signatures = new Map(
      await Promise.all(
        wallets
          .slice(0, 2)
          .map(
            async (w, i) =>
              [(await w.getAccounts())[0].address, signed[i].signatures[0]] as [string, Uint8Array],
          ),
      ),
    );
    const bytes = makeMultisignedTxBytes(
      pubkey,
      tx.sequence,
      tx.fee,
      signed[0].bodyBytes,
      signatures,
    );
    await preflightExec(rpc, "lava@", tx, pubkey, bytes);
    const result = await client.broadcastTx(bytes, 15000, 500);
    if (result.code) throw new Error(result.rawLog);
    return result;
  }
  it("executes a 2-of-3 multisig transfer, both vote versions, rewards and staking unbond in one batch", async () => {
    const before = BigInt((await client.getBalance(recipient, "utest")).amount);
    const beforeLava = BigInt((await client.getBalance(recipient, "ulava")).amount);
    const tx = await proposal([
      {
        typeUrl: MsgTypeUrls.Send,
        value: {
          fromAddress: granter,
          toAddress: recipient,
          amount: [
            { denom: "ulava", amount: "7" },
            { denom: "utest", amount: "123" },
          ],
        },
      },
      { typeUrl: MsgTypeUrls.Vote, value: { voter: granter, proposalId: "1", option: 1 } },
      { typeUrl: VOTE_V1, value: { voter: granter, proposalId: "1", option: 2 } },
      {
        typeUrl: VOTE_V1,
        value: { voter: granter, proposalId: "1", option: 3, metadata: "local-vote" },
      },
      {
        typeUrl: MsgTypeUrls.WithdrawDelegatorReward,
        value: { delegatorAddress: granter, validatorAddress: validator },
      },
      {
        typeUrl: MsgTypeUrls.Undelegate,
        value: {
          delegatorAddress: granter,
          validatorAddress: validator,
          amount: { denom: "ulava", amount: "1000" },
        },
      },
    ]);
    expect((await execute(tx)).code).toBe(0);
    expect(BigInt((await client.getBalance(recipient, "utest")).amount)).toBe(before + BigInt(123));
    expect(BigInt((await client.getBalance(recipient, "ulava")).amount)).toBe(
      beforeLava + BigInt(7),
    );
    const vote = await withAuthzQuery(rpc, chainId, (queryRpc) =>
      new GovQuery(queryRpc).Vote({ proposalId: BigInt(1), voter: granter }),
    );
    expect(vote.vote?.options[0].option).toBe(3);
    const state = await loadAuthzAccount(rpc, chainId, "lava@", granter, grantee);
    expect(state.delegations.find((d) => d.validator === validator)?.amount).toBe("999999000");
    await expect(preflightExec(rpc, "lava@", tx, pubkey)).rejects.toThrow(/sequence changed/);
  }, 45000);
  it("executes Lava dualstaking unbond against the actual provider allocation", async () => {
    const state = await loadAuthzAccount(rpc, chainId, "lava@", granter, grantee);
    expect(state.providers.length).toBeGreaterThan(0);
    const provider = state.providers[0].provider;
    const tx = await proposal([
      {
        typeUrl: MsgTypeUrls.DualUnbond,
        value: {
          creator: granter,
          validator,
          provider,
          chainID: "*",
          amount: { denom: "ulava", amount: "1000" },
        },
      },
    ]);
    expect((await execute(tx)).code).toBe(0);
    const after = await loadAuthzAccount(rpc, chainId, "lava@", granter, grantee);
    expect(after.delegations.find((d) => d.validator === validator)?.amount).toBe("999998000");
  }, 45000);
  it("rejects a previously prepared transfer after its grant is revoked", async () => {
    const tx = await proposal([
      {
        typeUrl: MsgTypeUrls.Send,
        value: {
          fromAddress: granter,
          toAddress: recipient,
          amount: [{ denom: "ulava", amount: "1" }],
        },
      },
    ]);
    const result = await granterClient.signAndBroadcast(
      granter,
      [
        {
          typeUrl: "/cosmos.authz.v1beta1.MsgRevoke",
          value: { granter, grantee, msgTypeUrl: MsgTypeUrls.Send },
        },
      ],
      { gas: "300000", amount: [{ denom: "ulava", amount: "10000" }] },
    );
    expect(result.code).toBe(0);
    await expect(preflightExec(rpc, "lava@", tx, pubkey)).rejects.toThrow(/Missing, expired/);
  }, 45000);
});
