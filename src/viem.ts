import { createPublicClient, http } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import env from "./env";

export const supportedChains = {
  arbitrum: {
    chain: arbitrum,
    bountyContractAddress: "0xEda8B0898DAc56ead2bC4f573C5252D3ef3d0b3c",
  },
  arbitrumSepolia: {
    chain: arbitrumSepolia,
    bountyContractAddress: "0x6E46796857a0E061374a0Bcb4Ce01af851773d2A",
  },
} as const;

export type SupportedChainKey = keyof typeof supportedChains;

export const getPublicClient = (chain: keyof typeof supportedChains) => {
  return createPublicClient({
    chain: supportedChains[chain].chain,
    transport: http(),
  });
};
