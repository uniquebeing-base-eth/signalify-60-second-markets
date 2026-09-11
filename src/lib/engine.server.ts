/**
 * Signalify market engine (server-only).
 *
 * Same duty cycle as the HyperWave oracle automation:
 *   start round (authoritative start price)
 *     -> accept predictions
 *     -> lock final 10s
 *     -> settle with authoritative end price
 *     -> pay winners 2x
 * Rounds are clock-derived per asset, so the next round always exists the
 * moment the previous one expires.
 */

import { authoritativePrice, referencePrice } from "./oracle.server";
import { pushRoundSettlement, pushRoundStart } from "./chain.server";
import { currentRoundNumber, roundWindow, ROUND_DURATION_SECONDS } from "./rounds";

type Db = Awaited<ReturnType<typeof getDb>>;

async function getDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type MarketRow = { symbol: string; name: string; sort_order: number };

export async function listMarkets(db: Db): Promise<MarketRow[]> {
  const { data } = await db
    .from("markets")
    .select("symbol, name, sort_order")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  return (data ?? []) as MarketRow[];
}

export type RoundRow = {
  symbol: string;
  round_number: number;
  start_ts: string;
  end_ts: string;
  start_price: number;
  end_price: number | null;
  outcome: "up" | "down" | "draw" | null;
  status: "live" | "closed" | "resolving" | "resolved";
};

/** Create the round row (with its authoritative start price) if it is missing. */
export async function ensureRound(db: Db, symbol: string, roundNumber: number): Promise<RoundRow> {
  const { data: existing } = await db
    .from("rounds")
    .select("symbol, round_number, start_ts, end_ts, start_price, end_price, outcome, status")
    .eq("symbol", symbol)
    .eq("round_number", roundNumber)
    .maybeSingle();
  if (existing) return existing as RoundRow;

  const { startSec, endSec } = roundWindow(roundNumber);
  const quote = await authoritativePrice(symbol, startSec);

  await db.from("rounds").insert({
    symbol,
    round_number: roundNumber,
    start_ts: new Date(startSec * 1000).toISOString(),
    end_ts: new Date(endSec * 1000).toISOString(),
    start_price: quote.price,
    status: "live",
  });

  // Best effort: mirror the round start on-chain when a contract is configured.
  void pushRoundStart(symbol, quote.scaled).catch(() => null);

  const { data } = await db
    .from("rounds")
    .select("symbol, round_number, start_ts, end_ts, start_price, end_price, outcome, status")
    .eq("symbol", symbol)
    .eq("round_number", roundNumber)
    .maybeSingle();
  return data as RoundRow;
}

/** Resolve every expired round and pay out its predictions. Idempotent. */
export async function settleDueRounds(db: Db): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: due } = await db
    .from("rounds")
    .select("symbol, round_number, start_price, end_ts")
    .neq("status", "resolved")
    .lte("end_ts", nowIso)
    .order("end_ts", { ascending: true })
    .limit(60);

  let settled = 0;
  for (const round of (due ?? []) as Array<{
    symbol: string;
    round_number: number;
    start_price: number;
    end_ts: string;
  }>) {
    const endSec = Math.floor(new Date(round.end_ts).getTime() / 1000);
    const quote = await authoritativePrice(round.symbol, endSec);
    const endPrice = quote.price;
    const outcome: "up" | "down" | "draw" =
      endPrice > round.start_price ? "up" : endPrice < round.start_price ? "down" : "draw";

    let settleTx: string | null = null;
    try {
      settleTx = await pushRoundSettlement(round.symbol, BigInt(round.round_number), quote.scaled);
    } catch {
      settleTx = null;
    }

    await db
      .from("rounds")
      .update({ end_price: endPrice, outcome, status: "resolved", settle_tx_hash: settleTx })
      .eq("symbol", round.symbol)
      .eq("round_number", round.round_number)
      .neq("status", "resolved");

    const { data: pending } = await db
      .from("predictions")
      .select("id, direction, amount")
      .eq("symbol", round.symbol)
      .eq("round_number", round.round_number)
      .eq("status", "pending");

    for (const p of (pending ?? []) as Array<{ id: string; direction: string; amount: number }>) {
      const won = outcome !== "draw" && p.direction === outcome;
      await db
        .from("predictions")
        .update({
          status: won ? "won" : "lost",
          payout: won ? Number(p.amount) * 2 : 0,
          settled_at: new Date().toISOString(),
        })
        .eq("id", p.id);
    }
    settled++;
  }
  return settled;
}

export type MarketSnapshot = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  roundNumber: number;
  startPrice: number;
  startsAtMs: number;
  endsAtMs: number;
  priceSource: string;
};

/** Everything the home screen needs for the live markets list. */
export async function buildMarketSnapshots(db: Db): Promise<MarketSnapshot[]> {
  const markets = await listMarkets(db);
  const roundNumber = currentRoundNumber();
  const nowSec = Math.floor(Date.now() / 1000);

  const snapshots: MarketSnapshot[] = [];
  for (const market of markets) {
    const round = await ensureRound(db, market.symbol, roundNumber);
    const quote = await authoritativePrice(market.symbol, nowSec);
    const dayAgo = referencePrice(market.symbol, nowSec - 6 * 60 * 60);
    snapshots.push({
      symbol: market.symbol,
      name: market.name,
      price: quote.price,
      changePct: ((quote.price - dayAgo) / dayAgo) * 100,
      roundNumber: round.round_number,
      startPrice: Number(round.start_price),
      startsAtMs: new Date(round.start_ts).getTime(),
      endsAtMs: new Date(round.end_ts).getTime(),
      priceSource: quote.source,
    });
  }
  return snapshots;
}

export const ROUND_SECONDS = ROUND_DURATION_SECONDS;
export { getDb };
