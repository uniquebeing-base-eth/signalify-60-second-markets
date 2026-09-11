/**
 * Continuous round maths, shared by client and server.
 *
 * Rounds are derived from the clock rather than created on demand, so the next
 * round is always already available the instant the current one expires — the
 * user never waits for a market.
 */

export const ROUND_DURATION_SECONDS = 60;
export const PREDICTION_CUTOFF_SECONDS = 10;

/** Round numbering epoch, keeps round numbers human-sized. */
const ROUND_EPOCH_SECONDS = Date.UTC(2026, 8, 1) / 1000;

export function roundNumberAt(epochSeconds: number): number {
  return Math.floor((epochSeconds - ROUND_EPOCH_SECONDS) / ROUND_DURATION_SECONDS);
}

export function currentRoundNumber(now: number = Date.now()): number {
  return roundNumberAt(Math.floor(now / 1000));
}

export function roundWindow(roundNumber: number): { startSec: number; endSec: number } {
  const startSec = ROUND_EPOCH_SECONDS + roundNumber * ROUND_DURATION_SECONDS;
  return { startSec, endSec: startSec + ROUND_DURATION_SECONDS };
}

export type RoundPhase = "live" | "ending" | "locked" | "resolving";

export function phaseFor(secondsRemaining: number): RoundPhase {
  if (secondsRemaining <= 0) return "resolving";
  if (secondsRemaining <= PREDICTION_CUTOFF_SECONDS) return "locked";
  if (secondsRemaining <= 20) return "ending";
  return "live";
}

export function formatCountdown(secondsRemaining: number): string {
  const s = Math.max(0, Math.floor(secondsRemaining));
  return `00:${String(s).padStart(2, "0")}`;
}
