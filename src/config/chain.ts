/**
 * Browser-safe Robinhood Chain configuration.
 * Every value is environment-driven — nothing chain-specific is hardcoded in
 * components. Server-side code reads the non-VITE equivalents.
 */

const env = import.meta.env as Record<string, string | undefined>;

export const chainConfig = {
  chainId: Number(env["VITE_CHAIN_ID"] ?? 46630),
  chainName: env["VITE_CHAIN_NAME"] ?? "Robinhood Chain Testnet",
  rpcUrl: env["VITE_RPC_URL"] ?? "https://testnet-rpc.robinhoodchain.com",
  explorerUrl: env["VITE_EXPLORER_URL"] ?? "https://testnet-explorer.robinhoodchain.com",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  sgnTokenAddress: env["VITE_SGN_TOKEN_ADDRESS"] ?? "",
  predictionContractAddress: env["VITE_PREDICTION_CONTRACT_ADDRESS"] ?? "",
} as const;

export const chainIdHex = `0x${chainConfig.chainId.toString(16)}`;

export function explorerTxUrl(hash: string) {
  return `${chainConfig.explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}
