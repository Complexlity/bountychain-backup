import { createPublicClient, http } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import env from "./env";

export const supportedChains = {
  arbitrum: {
    chain: arbitrum,
    contractAddress: "0x0000000000000000000000000000000000000000",
  },
  arbitrumSepolia: {
    chain: arbitrumSepolia,
    contractAddress: 
  "0x6E46796857a0E061374a0Bcb4Ce01af851773d2A" 
  },
} as const;

export type SupportedChainKey = keyof typeof supportedChains;


export const getPublicClient = (chain: keyof typeof supportedChains) => {
  return createPublicClient({
    chain: supportedChains[chain].chain,
    transport: http(),
  });
};
