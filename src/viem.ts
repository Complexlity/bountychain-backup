import { createPublicClient, http } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";

export const supportedChains = {
  [arbitrum.id]: arbitrum,
  [arbitrumSepolia.id]: arbitrumSepolia,
} as const;

export type supportedChainIds = (keyof typeof supportedChains)[];

export const getPublicClient = (chainId: keyof typeof supportedChains) => {
  return createPublicClient({
    chain: supportedChains[chainId],
    transport: http(),
  });
};
