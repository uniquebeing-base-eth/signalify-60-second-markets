/**
 * Authoritative price resolution for Signalify.
 *
 * The frontend price is informational only. Every market outcome is resolved
 * from THIS module, server-side, using a price that is a pure function of
 * (symbol, timestamp) so any node that settles a round arrives at the same
 * answer.
 *
 * Adapters, selected with ORACLE_ADAPTER:
 *  - "chainlink": reads a Robinhood Chain stock feed / Data Streams aggregator
 *    per symbol from ORACLE_CONFIG ({"AAPL":"0x..."} ) via latestRoundData().
 *  - "rest": reads STOCK_PRICE_API_URL (stock-token quote endpoint).
 *  - "deterministic" (default until feeds are configured): reproducible
 *    synthetic tape, identical on every server for a given second.
 *
 * All prices are returned with 8 decimals of precision as bigint, matching the
 * on-chain representation used by SignalifyPrediction.
 */

export const PRICE_SCALE = 100_000_000n; // 8 decimals

const REFERENCE_PRICES: Record<string, number> = {
  AAPL: 241.38,
  TSLA: 348.12,
  NVDA: 178.42,
  MSFT: 462.9,
  AMZN: 228.65,
};

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Reproducible synthetic tape: smooth waves + per-second deterministic jitter. */
function deterministicPrice(symbol: string, epochSeconds: number): number {
  const base = REFERENCE_PRICES[symbol] ?? 100 + hash32(symbol) * 200;
  const seed = hash32(symbol) * 1000;
  const t = epochSeconds;
  const wave =
    Math.sin((t + seed) / 610) * 0.011 +
    Math.sin((t + seed) / 137) * 0.004 +
    Math.sin((t + seed) / 37) * 0.0015;
  const jitter = (hash32(`${symbol}:${t}`) - 0.5) * 0.0009;
  return base * (1 + wave + jitter);
}

function toScaled(value: number): bigint {
  return BigInt(Math.round(value * 1e8));
}

function oracleConfig(): Record<string, string> {
  const raw = process.env["ORACLE_CONFIG"];
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

async function chainlinkPrice(symbol: string): Promise<bigint | null> {
  const feed = oracleConfig()[symbol] ?? process.env["ORACLE_ADDRESS"];
  const rpcUrl = process.env["RPC_URL"];
  if (!feed || !rpcUrl) return null;
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        // latestRoundData()
        params: [{ to: feed, data: "0xfeaf968c" }, "latest"],
      }),
    });
    const json = (await res.json()) as { result?: string };
    if (!json.result || json.result === "0x") return null;
    const answerWord = json.result.slice(2 + 64, 2 + 128);
    const answer = BigInt(`0x${answerWord}`);
    return answer > 0n ? answer : null;
  } catch {
    return null;
  }
}

async function restPrice(symbol: string): Promise<bigint | null> {
  const url = process.env["STOCK_PRICE_API_URL"];
  if (!url) return null;
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const key = process.env["STOCK_PRICE_API_KEY"];
    if (key) headers["Authorization"] = `Bearer ${key}`;
    const res = await fetch(url.replace("{symbol}", symbol), { headers });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const raw = (json["price"] ?? json["last"] ?? json["value"]) as number | string | undefined;
    const num = typeof raw === "string" ? Number(raw) : raw;
    return num && num > 0 ? toScaled(num) : null;
  } catch {
    return null;
  }
}

export type PriceQuote = {
  symbol: string;
  /** 8-decimal integer price, exactly what gets pushed on-chain. */
  scaled: bigint;
  /** Human number for display. */
  price: number;
  source: "chainlink" | "rest" | "deterministic";
  atSeconds: number;
};

/**
 * Authoritative price for a symbol at a specific second.
 * Live feeds are only consulted for "now"; historical settlement points always
 * use a reproducible value so a round can never resolve two different ways.
 */
export async function authoritativePrice(symbol: string, atSeconds: number): Promise<PriceQuote> {
  const adapter = process.env["ORACLE_ADAPTER"] ?? "deterministic";
  const nowSec = Math.floor(Date.now() / 1000);
  const isNow = Math.abs(nowSec - atSeconds) <= 2;

  if (isNow && adapter === "chainlink") {
    const scaled = await chainlinkPrice(symbol);
    if (scaled) {
      return { symbol, scaled, price: Number(scaled) / 1e8, source: "chainlink", atSeconds };
    }
  }
  if (isNow && adapter === "rest") {
    const scaled = await restPrice(symbol);
    if (scaled) {
      return { symbol, scaled, price: Number(scaled) / 1e8, source: "rest", atSeconds };
    }
  }

  const price = deterministicPrice(symbol, atSeconds);
  return { symbol, scaled: toScaled(price), price, source: "deterministic", atSeconds };
}

export function referencePrice(symbol: string, atSeconds: number): number {
  return deterministicPrice(symbol, atSeconds);
}
