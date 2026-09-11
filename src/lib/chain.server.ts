/**
 * Robinhood Chain access + backend signer (server-only).
 *
 * BACKEND_SIGNER_PRIVATE_KEY is read inside functions, never at module scope,
 * and never leaves the server. Only privileged round lifecycle calls
 * (startRound / settleRound) use it — exactly as in the original HyperWave
 * oracle automation.
 */

import { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export function robinhoodChain() {
  const id = Number(process.env["CHAIN_ID"] ?? 46630);
  const rpcUrl = process.env["RPC_URL"] ?? "https://testnet-rpc.robinhoodchain.com";
  const explorer = process.env["EXPLORER_URL"] ?? "https://testnet-explorer.robinhoodchain.com";
  return defineChain({
    id,
    name: process.env["CHAIN_NAME"] ?? "Robinhood Chain Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Explorer", url: explorer } },
  });
}

export function publicClient() {
  const chain = robinhoodChain();
  return createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
}

export function signerAccount() {
  const raw = process.env["BACKEND_SIGNER_PRIVATE_KEY"];
  if (!raw) return null;
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  try {
    return privateKeyToAccount(key);
  } catch {
    return null;
  }
}

export function walletClient() {
  const account = signerAccount();
  if (!account) return null;
  const chain = robinhoodChain();
  return createWalletClient({ account, chain, transport: http(chain.rpcUrls.default.http[0]) });
}

export const PREDICTION_ABI = [
  {
    type: "function",
    name: "startRound",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_assetId", type: "bytes32" },
      { name: "_startPrice", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settleRound",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_assetId", type: "bytes32" },
      { name: "_roundId", type: "uint256" },
      { name: "_endPrice", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export function assetIdFor(symbol: string): `0x${string}` {
  return keccak256(toHex(symbol));
}

/** Read an SGN balance straight from the wallet on Robinhood Chain. */
export async function readSgnBalance(
  address: string,
): Promise<{ balance: number; decimals: number } | null> {
  const token = process.env["SGN_TOKEN_ADDRESS"];
  if (!token) return null;
  try {
    const client = publicClient();
    const [raw, decimals] = await Promise.all([
      client.readContract({
        address: token as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      }),
      client.readContract({
        address: token as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "decimals",
      }),
    ]);
    const d = Number(decimals);
    return { balance: Number(raw) / 10 ** d, decimals: d };
  } catch {
    return null;
  }
}

/** Push the authoritative start price for a round. No-ops until deployed. */
export async function pushRoundStart(symbol: string, scaledPrice: bigint): Promise<string | null> {
  const contract = process.env["PREDICTION_CONTRACT_ADDRESS"];
  const wallet = walletClient();
  if (!contract || !wallet) return null;
  return wallet.writeContract({
    address: contract as `0x${string}`,
    abi: PREDICTION_ABI,
    functionName: "startRound",
    args: [assetIdFor(symbol), scaledPrice],
    chain: robinhoodChain(),
    account: wallet.account,
  });
}

/** Push the authoritative end price, which settles and pays winners on-chain. */
export async function pushRoundSettlement(
  symbol: string,
  roundId: bigint,
  scaledPrice: bigint,
): Promise<string | null> {
  const contract = process.env["PREDICTION_CONTRACT_ADDRESS"];
  const wallet = walletClient();
  if (!contract || !wallet) return null;
  return wallet.writeContract({
    address: contract as `0x${string}`,
    abi: PREDICTION_ABI,
    functionName: "settleRound",
    args: [assetIdFor(symbol), roundId, scaledPrice],
    chain: robinhoodChain(),
    account: wallet.account,
  });
}
