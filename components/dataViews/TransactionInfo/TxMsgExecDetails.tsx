import { useEffect, useState } from "react";
import { EncodeObject } from "@cosmjs/proto-signing";
import { Decimal } from "@cosmjs/math";
import { Coin } from "@cosmjs/amino";
import { QueryClientImpl } from "cosmjs-types/cosmos/distribution/v1beta1/query";
import { useChains } from "../../../context/ChainsContext";
import {
  EXEC,
  execToJson,
  guidedActions,
  innerActor,
  normalizeExec,
} from "../../../lib/authz/messages";
import { withAuthzQuery } from "../../../lib/authz/queries";
import { MsgTypeUrls } from "../../../types/txMsg";

export default function TxMsgExecDetails({ msgValue }: { msgValue: EncodeObject["value"] }) {
  const { chain } = useChains();
  const [withdrawals, setWithdrawals] = useState<Record<string, string>>({});
  let message: EncodeObject | undefined;
  let error = "";
  try {
    message = normalizeExec({ typeUrl: EXEC, value: msgValue });
  } catch (e) {
    error = e instanceof Error ? e.message : "Invalid execution message";
  }
  const actors = message
    ? Array.from(
        new Set(
          (message.value.msgs as EncodeObject[])
            .filter((m) => m.typeUrl === MsgTypeUrls.WithdrawDelegatorReward)
            .map(innerActor),
        ),
      )
        .sort()
        .join(",")
    : "";
  useEffect(() => {
    let active = true;
    setWithdrawals({});
    if (!actors || !chain.nodeAddress || !chain.chainId) return;
    withAuthzQuery(chain.nodeAddress, chain.chainId, async (rpc) => {
      const query = new QueryClientImpl(rpc);
      return Object.fromEntries(
        await Promise.all(
          actors
            .split(",")
            .map(async (actor) => [
              actor,
              (await query.DelegatorWithdrawAddress({ delegatorAddress: actor })).withdrawAddress,
            ]),
        ),
      );
    })
      .then((value) => {
        if (active) setWithdrawals(value);
      })
      .catch(() => {
        if (active) {
          setWithdrawals(
            Object.fromEntries(
              actors.split(",").map((a) => [a, "Unavailable — refresh before signing"]),
            ),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [actors, chain.nodeAddress, chain.chainId]);
  if (!message) return <p role="alert">Invalid authz transaction: {error}</p>;
  const printable = (coin: Coin) => {
    const asset = chain.assets.find((a) => a.base === coin.denom);
    const unit = asset?.denom_units.find((u) => u.denom === asset.display);
    return unit
      ? `${Decimal.fromAtomics(coin.amount, unit.exponent).toString()} ${asset?.symbol} (${
          coin.amount
        } ${coin.denom})`
      : `${coin.amount} ${coin.denom} (base units)`;
  };
  return (
    <div className="exec-details">
      <h3>Execute on behalf of another wallet</h3>
      <p>
        <strong>Multisig grantee / fee payer:</strong> {message.value.grantee}
      </p>
      {(message.value.msgs as EncodeObject[]).map((msg, i) => (
        <div className="action" key={i}>
          <h4>
            {i + 1}.{" "}
            {guidedActions.find((a) => a.typeUrl === msg.typeUrl)?.label ||
              msg.typeUrl.split(".").pop()}
          </h4>
          <p>
            <strong>Granter:</strong> {innerActor(msg)}
          </p>
          <dl>
            {Object.entries(msg.value)
              .filter(
                ([key]) => !["creator", "fromAddress", "delegatorAddress", "voter"].includes(key),
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {(
                      {
                        toAddress: "Recipient",
                        amount: "Amount",
                        validatorAddress: "Validator",
                        validator: "Validator",
                        validatorSrcAddress: "Source validator",
                        validatorDstAddress: "Destination validator",
                        fromProvider: "Source provider",
                        toProvider: "Destination provider",
                        provider: "Provider",
                        proposalId: "Proposal",
                        option: "Vote",
                        metadata: "Vote metadata",
                        chainID: "Legacy chain field",
                      } as Record<string, string>
                    )[key] || key}
                  </dt>
                  <dd>
                    {key === "amount"
                      ? (Array.isArray(value) ? value : [value])
                          .map((c) => printable(c as Coin))
                          .join(", ")
                      : key === "option"
                      ? ["Unspecified", "Yes", "Abstain", "No", "No with veto"][Number(value)]
                      : String(value ?? "") || "—"}
                  </dd>
                </div>
              ))}
          </dl>
          {msg.typeUrl === MsgTypeUrls.WithdrawDelegatorReward && (
            <p>
              Rewards go to the granter’s configured withdrawal address:{" "}
              <strong>{withdrawals[innerActor(msg)] || "Loading…"}</strong>. The amount is
              determined at execution.
            </p>
          )}
          {msg.typeUrl === MsgTypeUrls.DualClaimRewards && (
            <p>
              Rewards go to the granter.{" "}
              {msg.value.provider
                ? "Claims from the specified provider."
                : "Claims from all providers."}{" "}
              Amounts are determined at execution.
            </p>
          )}
          {(msg.typeUrl === MsgTypeUrls.Undelegate || msg.typeUrl === MsgTypeUrls.DualUnbond) && (
            <p>
              Starts unbonding; tokens are not transferred immediately. Vesting restrictions remain.
              On Lava, staking and provider allocations are coupled.
            </p>
          )}
        </div>
      ))}
      <details>
        <summary>Transaction messages JSON</summary>
        <pre>{JSON.stringify(execToJson(message), null, 2)}</pre>
      </details>
      <style jsx>{`
        .exec-details {
          overflow-wrap: anywhere;
        }
        .action {
          border-top: 1px solid #78608b;
          padding: 12px 0;
        }
        dl div {
          margin: 8px 0;
        }
        dt {
          opacity: 0.75;
          font-size: 0.85em;
        }
        dd {
          margin: 2px 0;
        }
        pre {
          overflow: auto;
          max-width: 100%;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
