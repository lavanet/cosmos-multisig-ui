"use client";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useChains } from "@/context/ChainsContext";
import { getProvidersNext } from "@/lib/pairing";
import { cn, toastError } from "@/lib/utils";
import { ProviderMetadata } from "@lavanet/lavajs/dist/codegen/lavanet/lava/epochstorage/provider_metadata";
import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState, memo } from "react";

interface SelectProviderProps {
  readonly providerAddress: string;
  readonly setProviderAddress: (providerAddress: string) => void;
}

function SelectProviderNext({ providerAddress, setProviderAddress }: SelectProviderProps) {
  const { chain } = useChains();
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<readonly ProviderMetadata[]>();
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    const updateProviders = async () => {
      try {
        const newProviders = await getProvidersNext(chain.nodeAddress);
        if (newProviders.length) {
          setProviders(newProviders);
        }
      } catch (e) {
        setProviders([]);
        console.error("Failed to get providers:", e);
        toastError({
          description: "Failed to get providers",
          fullError: e instanceof Error ? e : undefined,
        });
      }
    };

    updateProviders();
  }, [chain.nodeAddress]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="mb-4 w-full max-w-[300px] justify-between border-white bg-fuchsia-900 hover:bg-fuchsia-900"
        >
          {providerAddress
            ? providers?.find((providerItem) => providerAddress === providerItem.provider)
                ?.description?.moniker || "Unknown provider"
            : "Select provider…"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Command className="bg-fuchsia-900">
          <CommandInput
            placeholder="Search provider…"
            value={searchText}
            onValueChange={setSearchText}
          />
          <CommandEmpty>No provider found.</CommandEmpty>
          <CommandGroup className="max-h-[400px] overflow-y-auto">
            {providers?.map((providerItem) => (
              <CommandItem
                className="aria-selected:bg-fuchsia-800"
                key={providerItem.provider}
                onSelect={() => {
                  setProviderAddress(providerItem.provider);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    providerAddress === providerItem.provider ? "opacity-100" : "opacity-0",
                  )}
                />
                {providerItem.description?.moniker}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
export default memo(SelectProviderNext);
