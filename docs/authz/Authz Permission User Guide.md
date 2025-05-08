### Grant permission 

Grant permission works only with the file trx feature.

To grant permission, use the following structure:

```json
[
    {
      "typeUrl": "/cosmos.authz.v1beta1.MsgGrant",
      "value": {
        "granter": "lava@1e3yksvnp3wwqja79w7527k3th4yjyapmvp706e",
        "grantee": "lava@146chxxgm3xec2530sfz2qlsh0cry483uzhzmr0",
        "grant": {
          "authorization": {
            "typeUrl": "/cosmos.authz.v1beta1.GenericAuthorization",
            "value": {
              "msg": "/cosmos.staking.v1beta1.MsgDelegate"
            }
          },
          "expiration": null
        }
      }
    }
  ]
```
### Tested Grant Permissions
The following message types have been tested and are supported:

- `/lavanet.lava.dualstaking.MsgClaimRewards` 
- `/lavanet.lava.dualstaking.MsgDelegate` 
- `/lavanet.lava.dualstaking.MsgRedelegate` 
- `/lavanet.lava.dualstaking.MsgUnbond` 
- `/cosmos.staking.v1beta1.MsgDelegate` 
- `/cosmos.staking.v1beta1.MsgBeginRedelegate` 
- `/cosmos.staking.v1beta1.MsgUndelegate` 
- `/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward` 

### Exec Permission  

Exec permission is supported only with the future file and for the message types listed under `Tested Grant Permissions`.

To check exec permission, please refer to the `exec_` file examples. Before perform an Exec transaction, the wallet should have the specific permission listed above.

### Limitation 

Trx can only be used as either an exec transaction or a regular transaction and cannot be mixed.

Example of a mixed transaction that ***won't*** work:

```json 
[
    {
      "typeUrl": "/cosmos.authz.v1beta1.MsgExec",
      "value": {
        "grantee": "lava@146chxxgm3xec2530sfz2qlsh0cry483uzhzmr0",
        "msgs": [
          {
            "typeUrl": "/lavanet.lava.dualstaking.MsgDelegate",
            "value": {
              "creator": "lava@1e3yksvnp3wwqja79w7527k3th4yjyapmvp706e",
              "validator": "lava@valoper1jfap4c3chh6hprx0utekpxpwdgxwaheacgtvu5",
              "provider": "lava@1mm99gwhexvtfr3qjhafn3ugl6z3xxuu6ndmvrn",
              "chainID": "*",
              "amount": {
                "denom": "ulava",
                "amount": "1000000"
              }
            }
          }
        ]
      }
    },
    {
        "typeUrl": "/cosmos.bank.v1beta1.MsgSend",
        "value": {
          "fromAddress": "lava@146chxxgm3xec2530sfz2qlsh0cry483uzhzmr0",
          "toAddress": "lava@1lws6rcrcdtxadc6c2j70sezwjwuzq6apq89ex6",
          "amount": [
            {
              "denom": "ulava",
              "amount": "1"
            }
          ]
        }
      }
  ]
```

This won't work because `/cosmos.authz.v1beta1.MsgExec` and regular messages use different signers. However, if the transaction contains only MsgExec or only regular messages, it should work. If you need to achieve this, you should split the transaction into two and perform the messages separately.