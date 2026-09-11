/**
 * SGN eligibility (server-only).
 *
 * The $5 rule is a WALLET BALANCE CHECK ONLY. SGN is never staked, locked,
 * escrowed, transferred or deposited for eligibility — it simply has to sit in
 * the user's Robinhood Chain wallet.
 */

import { readSgnBalance } from "./chain.server";

export type SgnStatus = {
  address: string;
  balance: number;
  priceUsd: number;
  valueUsd: number;
  requiredUsd: number;
  eligible: boolean;
  tokenConfigured: boolean;
  /** True when no SGN token address is configured yet, so a testnet stand-in is shown. */
  simulated: boolean;
};

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export async function getSgnStatus(address: string): Promise<SgnStatus> {
  const requiredUsd = Number(process.env["SGN_MIN_USD"] ?? 5);
  const priceUsd = Number(process.env["SGN_PRICE_USD"] ?? 0.05);
  const tokenConfigured = Boolean(process.env["SGN_TOKEN_ADDRESS"]);

  const onchain = tokenConfigured ? await readSgnBalance(address) : null;

  if (onchain) {
    const valueUsd = onchain.balance * priceUsd;
    return {
      address,
      balance: onchain.balance,
      priceUsd,
      valueUsd,
      requiredUsd,
      eligible: valueUsd >= requiredUsd,
      tokenConfigured,
      simulated: false,
    };
  }

  // No SGN contract configured yet (or RPC unavailable): show a deterministic
  // testnet stand-in so the flow is testable end to end before deployment.
  const balance = Math.round(hash(address.toLowerCase()) * 6000 + 40);
  const valueUsd = balance * priceUsd;
  return {
    address,
    balance,
    priceUsd,
    valueUsd,
    requiredUsd,
    eligible: valueUsd >= requiredUsd,
    tokenConfigured,
    simulated: true,
  };
}
