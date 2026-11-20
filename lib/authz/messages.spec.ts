/** @jest-environment node */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { toBech32 } from "@cosmjs/encoding";
import { MsgExec } from "cosmjs-types/cosmos/authz/v1beta1/tx";
import { MsgVote } from "cosmjs-types/cosmos/gov/v1/tx";
import { MsgTypeUrls } from "../../types/txMsg";
import { dbTxFromJson, exportMsgToJson } from "../txMsgHelpers";
import { execMessages, EXEC, normalizeExec, VOTE_V1 } from "./messages";

const grantee = toBech32("lava@", new Uint8Array(20).fill(1));
const granter = toBech32("lava@", new Uint8Array(20).fill(2));
const send = {
  typeUrl: MsgTypeUrls.Send,
  value: {
    fromAddress: granter,
    toAddress: grantee,
    amount: [{ denom: "ulava", amount: "9007199254740993" }],
  },
};
const envelope = (msgs = [send]) => ({ typeUrl: EXEC, value: { grantee, msgs } });
const files = readdirSync(join(process.cwd(), "docs/authz")).filter(
  (f) => f.startsWith("exec_") && f.endsWith(".json"),
);
it.each(files)("roundtrips documented nested JSON, binary and Amino: %s", (file) => {
  const messages = JSON.parse(readFileSync(join(process.cwd(), "docs/authz", file), "utf8"));
  const originals = execMessages(messages);
  const tx = dbTxFromJson(JSON.stringify({ msgs: messages.map(exportMsgToJson) }))!;
  expect(tx).not.toBeNull();
  const restored = execMessages(tx.msgs);
  originals.forEach((m, i) => {
    expect(restored[i].toBinary()).toEqual(m.toBinary());
    expect(restored[i].toAmino()).toEqual(m.toAmino());
    expect(MsgExec.decode(m.toBinary()).msgs.length).toBe(messages[i].value.msgs.length);
  });
});
it.each([MsgTypeUrls.Vote, VOTE_V1])("keeps uint64 proposal IDs exact for %s", (typeUrl) => {
  const msg = {
    typeUrl: EXEC,
    value: {
      grantee,
      msgs: [{ typeUrl, value: { voter: granter, proposalId: "9007199254740993", option: 1 } }],
    },
  };
  const exec = execMessages([msg])[0];
  expect(exec.toAmino().value.msgs[0].value).toEqual({
    voter: granter,
    proposal_id: "9007199254740993",
    option: 1,
  });
  expect(MsgVote.decode(MsgExec.decode(exec.toBinary()).msgs[0].value).proposalId).toBe(
    BigInt("9007199254740993"),
  );
});
it("includes nonempty v1 vote metadata", () => {
  const m = {
    typeUrl: EXEC,
    value: {
      grantee,
      msgs: [
        {
          typeUrl: VOTE_V1,
          value: { voter: granter, proposalId: "1", option: 4, metadata: "ipfs://vote" },
        },
      ],
    },
  };
  expect(execMessages([m])[0].toAmino().value.msgs[0]).toEqual({
    type: "cosmos-sdk/v1/MsgVote",
    value: { voter: granter, proposal_id: "1", option: 4, metadata: "ipfs://vote" },
  });
});
it("rejects mixed, nested, empty, wrong-grantee and oversized batches", () => {
  expect(() => execMessages([envelope(), send])).toThrow(/mixed/);
  expect(() => execMessages([envelope([envelope() as unknown as typeof send])])).toThrow(
    /Unsupported/,
  );
  expect(() => execMessages([envelope([])])).toThrow();
  expect(() => execMessages([envelope()], granter)).toThrow(/grantee/);
  expect(() => execMessages([envelope(Array(101).fill(send))])).toThrow();
  expect(() =>
    execMessages([envelope(Array(60).fill(send)), envelope(Array(60).fill(send))]),
  ).toThrow(/100/);
});
it.each(["0", "-1", "1.2", "1e6", "01"])("rejects invalid amount %s", (amount) => {
  expect(() =>
    normalizeExec(
      envelope([{ ...send, value: { ...send.value, amount: [{ denom: "ulava", amount }] } }]),
    ),
  ).toThrow();
});
it("rejects unknown fields and invalid address prefixes before signing", () => {
  expect(() =>
    normalizeExec({ ...envelope(), value: { ...envelope().value, hidden: "payload" } }),
  ).toThrow();
  expect(() =>
    normalizeExec(
      envelope([
        { ...send, value: { ...send.value, toAddress: toBech32("cosmos", new Uint8Array(20)) } },
      ]),
    ),
  ).toThrow();
});
