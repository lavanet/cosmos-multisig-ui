import * as lavajs from "@lavanet/lavajs";
import { StakeEntry } from "@lavanet/lavajs/dist/codegen/lavanet/lava/epochstorage/stake_entry";
import { ProviderMetadata } from "@lavanet/lavajs/dist/codegen/lavanet/lava/epochstorage/provider_metadata";

export const getProviders = async (
  rpcEndpoint: string,
  chainID: string,
): Promise<readonly StakeEntry[]> => {
  const queryClient = await lavajs.lavanet.ClientFactory.createRPCQueryClient({ rpcEndpoint });

  const { stakeEntry } = await queryClient.lavanet.lava.pairing.providers({
    chainID,
    showFrozen: true,
  });

  return stakeEntry.sort((a, b) => a.moniker.localeCompare(b.moniker));
};
// todo: move  all SelectProvider to SelectProviderNext
export const getProvidersNext = async (
  rpcEndpoint: string,
): Promise<readonly ProviderMetadata[]> => {
  const queryClient = await lavajs.lavanet.ClientFactory.createRPCQueryClient({ rpcEndpoint });
  const { metaData } = await queryClient.lavanet.lava.epochstorage.providerMetaData({
    provider: "",
  });

  return metaData.sort((a, b) => a.description.moniker.localeCompare(b.description.moniker));
};
