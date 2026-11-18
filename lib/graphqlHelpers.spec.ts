/** @jest-environment node */
import {
  createSignature,
  createTransaction,
  findTransactionByID,
  updateTxHash,
  getMultisig,
  createMultisig,
} from "./graphqlHelpers";
import { requestGraphQlJson } from "./request";
jest.mock("./request", () => ({
  requestGraphQlJson: jest.fn().mockResolvedValue({ data: { queryMultisig: [] } }),
}));
it("keeps untrusted data out of GraphQL syntax for every operation", async () => {
  const attack = '"}) { id } } mutation Evil { deleteTransaction(filter: {}) { numUids } } #';
  await createSignature({ address: attack, signature: attack, bodyBytes: attack }, attack);
  await createTransaction(attack);
  await findTransactionByID(attack);
  await updateTxHash(attack, attack);
  await getMultisig(attack, attack);
  await createMultisig({ address: attack, chainId: attack, pubkeyJSON: attack });
  expect(requestGraphQlJson).toHaveBeenCalledTimes(6);
  for (const [config] of jest.mocked(requestGraphQlJson).mock.calls) {
    expect(config.body.query).not.toContain(attack);
    expect(Object.values(config.body.variables!).flat()).toContain(attack);
  }
});
