/** @jest-environment node */
import { toBase64, toBech32 } from "@cosmjs/encoding";
import { recordId, signatureSchema, txHashSchema, validateTransactionJson } from "./apiValidation";
import { EXEC } from "./authz/messages";
import { MsgTypeUrls } from "../types/txMsg";
const actor = toBech32("lava@", new Uint8Array(20).fill(1));
const tx = {
  accountNumber: 1,
  sequence: 2,
  chainId: "lava",
  memo: "",
  fee: { gas: "1000", amount: [{ denom: "ulava", amount: "1" }] },
  msgs: [
    {
      typeUrl: EXEC,
      value: {
        grantee: actor,
        msgs: [
          {
            typeUrl: MsgTypeUrls.Send,
            value: {
              fromAddress: actor,
              toAddress: actor,
              amount: [{ denom: "ulava", amount: "1" }],
            },
          },
        ],
      },
    },
  ],
};
it("accepts a serializable unsigned proposal and rejects malformed metadata", () => {
  expect(validateTransactionJson(JSON.stringify(tx))).toBe(JSON.stringify(tx));
  for (const change of [
    { sequence: -1 },
    { accountNumber: Number.MAX_SAFE_INTEGER + 1 },
    { msgs: [] },
    { fee: { gas: "1e6", amount: [] } },
  ])
    {expect(() => validateTransactionJson(JSON.stringify({ ...tx, ...change }))).toThrow();}
  expect(() => validateTransactionJson("x".repeat(1000001))).toThrow();
});
it("constrains database IDs, hashes and signature payloads", () => {
  expect(recordId.parse("0x123")).toBe("0x123");
  expect(() => recordId.parse('0x123"}')).toThrow();
  expect(() => txHashSchema.parse("fake")).toThrow();
  const sig = { address: actor, signature: toBase64(new Uint8Array(64)), bodyBytes: "AQ==" };
  expect(signatureSchema.parse(sig)).toEqual(sig);
  expect(() => signatureSchema.parse({ ...sig, signature: "AQ==" })).toThrow();
  expect(() => signatureSchema.parse({ ...sig, bodyBytes: "invalid" })).toThrow();
});
