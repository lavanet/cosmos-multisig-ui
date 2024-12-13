import { Decimal } from "@cosmjs/math";
import { Coin } from "@cosmjs/stargate";
import { assert } from "@cosmjs/utils";
import { RegistryAsset, RegistryAssetDenomUnit } from "../types/chainRegistry";

export const findAssetAndUnits = (
  denom: string,
  assets: readonly RegistryAsset[],
): { asset: RegistryAsset; baseUnit: RegistryAssetDenomUnit; targetUnit: RegistryAssetDenomUnit } => {
  const lowerCaseDenom = denom.toLowerCase();

  const asset = assets.find(
    (currentAsset) =>
      lowerCaseDenom === currentAsset.base.toLowerCase() ||
      lowerCaseDenom === currentAsset.symbol.toLowerCase() ||
      lowerCaseDenom === currentAsset.display.toLowerCase() ||
      lowerCaseDenom === currentAsset.name.toLowerCase() ||
      currentAsset.denom_units.find(
        (unit) => unit.denom === lowerCaseDenom || unit.aliases?.includes(lowerCaseDenom),
      ),
  );
 

  assert(asset, `An asset with the given denomination ${denom} was not found`);

  const baseUnit = asset.denom_units.find((currentUnit) => currentUnit.exponent === 0);
  assert(baseUnit, `A base unit with exponent = 0 was not found`);

  const targetUnit = asset.denom_units.find(
    (currentUnit) => currentUnit.denom.toLowerCase() === lowerCaseDenom,
  );
  assert(
    targetUnit,
    `A target unit with the given denomination ${lowerCaseDenom} was not found`,
  );
  return { asset, baseUnit, targetUnit };
};
// todo: fix repeated code
export const displayCoinToBaseCoin = (displayCoin: Coin, assets: readonly RegistryAsset[]): Coin => {
  const lowerCaseDenom = displayCoin.denom.toLowerCase();

  const asset = assets.find(
    (currentAsset) =>
      lowerCaseDenom === currentAsset.symbol.toLowerCase() ||
      lowerCaseDenom === currentAsset.display.toLowerCase() ||
      lowerCaseDenom === currentAsset.name.toLowerCase() ||
      lowerCaseDenom === currentAsset.base.toLowerCase() ||
      currentAsset.denom_units.find(
        (unit) => unit.denom === lowerCaseDenom || unit.aliases?.includes(lowerCaseDenom),
      ),
  );

  // Leave IBC coins as is if not found on registry assets
  if (!asset && displayCoin.denom.toLowerCase().startsWith("ibc/")) {
    return displayCoin;
  }

  assert(asset, `An asset with the given symbol ${displayCoin.denom} was not found`);

  const macroUnit = asset.denom_units.find(
    (currentUnit) => lowerCaseDenom === currentUnit.denom.toLowerCase(),
  );
  assert(macroUnit, `A unit with the given symbol ${lowerCaseDenom} was not found`);

  const baseUnit = asset.denom_units.find((currentUnit) => currentUnit.exponent === 0);
  assert(baseUnit, `A base unit with exponent = 0 was not found`);

  const denom = baseUnit.denom;
  const amount = Decimal.fromUserInput(
    displayCoin.amount.trim() || "0",
    macroUnit.exponent,
  ).atomics;

  return { denom, amount };
};

export const baseCoinToDisplayCoin = (baseCoin: Coin, assets: readonly RegistryAsset[]): Coin => {
  const { asset } = findAssetAndUnits(baseCoin.denom, assets);
  const { targetUnit } = findAssetAndUnits(asset.display, assets);

  const denom = targetUnit.denom;
  const amount = Decimal.fromAtomics(
    baseCoin.amount.trim() || "0",
    targetUnit.exponent,
  ).toString();

  return { denom, amount };
};