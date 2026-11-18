import { DbAccount, DbSignature } from "../types";
import { requestGraphQlJson } from "./request";

/**
 * Creates multisig record in dgraph
 *
 * @param {object} multisig an object with address (string), pubkey JSON and chainId
 * @return Returns async function that makes a request to the dgraph graphql endpoint
 */
const createMultisig = async (multisig: DbAccount) => {
  return requestGraphQlJson({
    body: {
      variables: {
        chainId: multisig.chainId,
        address: multisig.address,
        pubkey: multisig.pubkeyJSON,
      },
      query: `
        mutation AddMultisig($chainId: String!, $address: String!, $pubkey: String!) {
          addMultisig(
            input: {
              chainId: $chainId
              address: $address
              pubkeyJSON: $pubkey
            }
          ) {
            multisig {
              id
              chainId
              address
            }
          }
        }
      `,
    },
  });
};

/**
 * This is the format returned by the graphQL API.
 *
 * Keep the format in sync with `GetMultisigAccountResponse` because
 * we return the full object in the API. Right now address and chainId
 * are somewhat unnecessary to query but still nice for debgging.
 */
interface MultisigFromQuery {
  address: string;
  chainId: string;
  pubkeyJSON: string;
}

/**
 * Gets multisig pubkey from DB
 *
 * @param {string} address A multisig address.
 * @param {string} chainId The chainId the multisig belongs to.
 * @return Returns async function that makes a request to the dgraph graphql endpoint
 */
async function getMultisig(
  address: string,
  chainId: string,
): Promise<MultisigFromQuery | undefined> {
  const result = await requestGraphQlJson({
    body: {
      variables: { address, chainId },
      query: `
        query MultisigsByAddressAndChainId($address: String!, $chainId: String!) {
          queryMultisig(filter: {address: {eq: $address}, chainId: {eq: $chainId}}) {
            address
            chainId
            pubkeyJSON
          }
        }
      `,
    },
  });
  const elements: [MultisigFromQuery] = result.data.queryMultisig;
  const first = elements.find(() => true);
  return first;
}

/**
 * Creates transaction record in dgraph
 *
 * @param {object} transaction The base transaction
 * @return Returns async function that makes a request to the dgraph graphql endpoint
 */
const createTransaction = async (transaction: string) => {
  return requestGraphQlJson({
    body: {
      variables: { data: transaction },
      query: `
        mutation AddTransaction($data: String!) {
          addTransaction(input: { dataJSON: $data }) {
            transaction {
              id
            }
          }
        }
      `,
    },
  });
};

/**
 * Retrieves a transaction from dgraph
 *
 * @param {string} id dgraph resource id
 * @return Returns async function that makes a request to the dgraph graphql endpoint
 */
const findTransactionByID = async (id: string) => {
  return requestGraphQlJson({
    body: {
      variables: { id },
      query: `
        query GetTransaction($id: ID!) {
          getTransaction(id: $id) {
            dataJSON
            txHash
            signatures {
              address
              signature
              bodyBytes
            }
          }
        }
      `,
    },
  });
};

/**
 * Updates txHash of transaction on dgraph
 *
 * @param {string} id dgraph resource id
 * @param {string} txHash tx hash returned from broadcasting a tx
 * @return Returns async function that makes a request to the dgraph graphql endpoint
 */
const updateTxHash = async (id: string, txHash: string) => {
  return requestGraphQlJson({
    body: {
      variables: { id: [id], hash: txHash },
      query: `
        mutation UpdateTransaction($id: [ID!]!, $hash: String!) {
          updateTransaction(
            input: { filter: { id: $id }, set: { txHash: $hash } }
          ) {
            transaction {
              id
              dataJSON
              txHash
              signatures {
                address
                signature
                bodyBytes
              }
            }
          }
        }
      `,
    },
  });
};

/**
 * Creates signature record in dgraph
 *
 * @param {object} signature an object with bodyBytes (string) and signature set (Uint8 Array)
 * @param {string} transactionId id of the transaction to relate the signature with
 * @return Returns async function that makes a request to the dgraph graphql endpoint
 */
const createSignature = async (signature: DbSignature, transactionId: string) => {
  return requestGraphQlJson({
    body: {
      variables: {
        id: transactionId,
        address: signature.address,
        signature: signature.signature,
        body: signature.bodyBytes,
      },
      query: `
        mutation AddSignature($id: ID!, $address: String!, $signature: String!, $body: String!) {
          addSignature(
            input: {
              transaction: { id: $id }
              address: $address
              signature: $signature
              bodyBytes: $body
            }
          ) {
            signature {
              transaction {
                id
              }
              signature
            }
          }
        }
      `,
    },
  });
};

export {
  createMultisig,
  createSignature,
  createTransaction,
  findTransactionByID,
  getMultisig,
  updateTxHash,
};
