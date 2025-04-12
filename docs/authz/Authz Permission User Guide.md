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

- `/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward` 
- `/lavanet.lava.dualstaking.MsgClaimRewards` 
- `/lavanet.lava.dualstaking.MsgDelegate` 
- `/lavanet.lava.dualstaking.MsgRedelegate` 
- `/lavanet.lava.dualstaking.MsgUnbond` 
- `/cosmos.staking.v1beta1.MsgDelegate` 
- `/cosmos.staking.v1beta1.MsgBeginRedelegate` 
- `/cosmos.staking.v1beta1.MsgUndelegate` 


### Exec Permission  

Exec permission is supported only with the file future and for the message types listed under `Tested Grant Permissions`

To check exec permission, please refer to the exec_ file examples.