import { z } from "zod";
import { fromBase64, toBase64 } from "@cosmjs/encoding";
import { dbTxFromJson } from "./txMsgHelpers";
import { approvedTransaction } from "./transactionIntegrity";

export const recordId = z
  .string()
  .regex(/^0x[0-9a-f]+$/i)
  .max(66);
export const txHashSchema = z.string().regex(/^[0-9a-f]{64}$/i);
const base64 = z
  .string()
  .min(1)
  .max(1400000)
  .refine((value) => {
    try {
      return toBase64(fromBase64(value)) === value;
    } catch {
      return false;
    }
  }, "Invalid base64");
export const signatureSchema = z
  .object({
    address: z.string().min(1).max(128),
    signature: base64.refine(
      (value) => fromBase64(value).length === 64,
      "Expected a 64-byte signature",
    ),
    bodyBytes: base64,
  })
  .strict();
export function validateTransactionJson(value: unknown): string {
  const text = z.string().min(1).max(1000000).parse(value);
  const uint = z
    .string()
    .regex(/^(0|[1-9][0-9]*)$/)
    .max(78);
  z.object({
    accountNumber: z.number().int().nonnegative().safe(),
    sequence: z.number().int().nonnegative().safe(),
    chainId: z.string().min(1).max(128),
    memo: z.string().max(10000),
    fee: z
      .object({
        gas: uint,
        amount: z
          .array(z.object({ denom: z.string().min(1).max(128), amount: uint }).strict())
          .max(50),
      })
      .strict(),
    msgs: z
      .array(z.object({ typeUrl: z.string(), value: z.unknown() }).strict())
      .min(1)
      .max(100),
  })
    .strict()
    .parse(JSON.parse(text));
  const tx = dbTxFromJson(text);
  if (!tx) throw new Error("Invalid transaction messages");
  approvedTransaction(tx);
  return text;
}
