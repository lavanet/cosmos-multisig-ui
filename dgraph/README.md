
### HOW TO RUN 

1. Create `auth_token` file in path `dgrapgh/secrets/auth_token` with proteceted
`DGRAPH_SECRET` key
2. Run docker containers
```bash
docker compose up -d 
```
3. Aplly Schema 
```bash
curl -X POST http://localhost:8080/admin/schema -H "Content-Type: application/graphql"   --data-binary 'type Multisig { id: ID! chainId: String! @search(by: [hash]) address: String! @search(by: [hash]) pubkeyJSON: String! } type Transaction { id: ID! txHash: String dataJSON: String signatures: [Signature] @hasInverse(field: transaction) } type Signature { transaction: Transaction! bodyBytes: String! signature: String! address: String! }' 
```