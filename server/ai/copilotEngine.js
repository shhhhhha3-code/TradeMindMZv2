import { buildCandidates } from "../../engine/candidateEngine.js";
import { runAIDecisionLayer } from "./aiDecisionEngine.js";

const ACTIONS = {
  TRADE: "TRADE",
  WATCH: "WATCH",
  NO_TRADE: "NO_TRADE",
  PROTECT: "PROTECT",
  EXIT_REVIEW: "EXIT_REVIEW",
};

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function direction(value) {
  const v = String(value ?? "").toUpperCase();
  if (v === "BUY" || v === "LONG" || v === "UP") return "BULLISH";
  if (v === "SELL" || v === "SHORT" || v === "DOWN") return "BEARISH";
  return "NEUTRAL";
}

function regime(candidates) {
  const dirs = candidates.map(c => direction(c.direction ?? c.trend));
  const bullish = dirs.filter(v => v === "BULLISH").length;
  const bearish = dirs.filter(v => v === "BEARISH").length;
  if (bullish >= 3 && bullish > bearish) return "BULLISH";
  if (bearish >= 3 && bearish > bullish) return "BEARISH";
  return "MIXED";
}

function factorState(candidate) {
  if (!candidate) return [];
  const factors = [];
  const rsi = finite(candidate.rsi);
  const rr = finite(candidate.riskReward);
  const volume = finite(candidate.volumeRatio);
  const change = finite(candidate.change24h);

  if (candidate.engineScore >= 75) factors.push({ name: "Engine score", state: "PASS", value: candidate.engineScore });
  else factors.push({ name: "Engine score", state: "FAIL", value: candidate.engineScore });

  if (candidate.confidence == null || candidate.confidence >= 80) factors.push({ name: "Confidence", state: "PASS", value: candidate.confidence });
  else factors.push({ name: "Confidence", state: "FAIL", value: candidate.confidence });

  if (rr == null || rr >= 2) factors.push({ name: "Risk/reward", state: "PASS", value: rr });
  else factors.push({ name: "Risk/reward", state: "FAIL", value: rr });

  if (rsi == null || (rsi >= 35 && rsi <= 70)) factors.push({ name: "RSI", state: "PASS", value: rsi });
  else factors.push({ name: "RSI", state: "FAIL", value: rsi });

  if (volume == null || volume >= 0.8) factors.push({ name: "Volume", state: "PASS", value: volume });
  else factors.push({ name: "Volume", state: "FAIL", value: volume });

  if (candidate.risk?.level !== "HIGH") factors.push({ name: "Risk", state: "PASS", value: candidate.risk?.level ?? null });
  else factors.push({ name: "Risk", state: "FAIL", value: "HIGH" });

  if (change != null) factors.push({ name: "24h momentum", state: change > 0 ? "POSITIVE" : change < 0 ? "NEGATIVE" : "FLAT", value: change });

  return factors;
}

function buildExplanation(candidate, action) {
  if (!candidate) return "Insufficient market data.";
  const blockers = candidate.risk?.reasons ?? [];
  if (action === ACTIONS.NO_TRADE) {
    return blockers.length
      ? `No trade: deterministic risk gates blocked this setup (${blockers.join(", ")}).`
      : "No trade: the setup does not meet the minimum confluence required by TradeMindMZ.";
  }
  if (action === ACTIONS.WATCH) {
    return "Watch: the setup has useful confluence, but at least one required confirmation is still missing.";
  }
  return `Trade candidate: ${candidate.symbol} passes the deterministic filters and can be cross-checked by the AI layer.`;
}

export async function runCopilot({
  markets = [],
  position = null,
  preferredProvider = null,
  candidateLimit = 5,
} = {}) {
  const candidates = buildCandidates(markets, { limit: candidateLimit });
  const ai = await runAIDecisionLayer(candidates, { preferredProvider });

  let action = ai.decision === "TRADE"
    ? ACTIONS.TRADE
    : ai.decision === "WATCH"
      ? ACTIONS.WATCH
      : ACTIONS.NO_TRADE;

  let positionReview = null;

  if (position) {
    const entry = finite(position.entryPrice ?? position.entry);
    const current = finite(position.currentPrice ?? position.markPrice ?? position.price);
    const stop = finite(position.stopLoss ?? position.stop);
    const side = String(position.side ?? position.direction ?? "").toUpperCase();
    const pnlPct = entry && current
      ? side === "SELL" || side === "SHORT"
        ? ((entry - current) / entry) * 100
        : ((current - entry) / entry) * 100
      : null;

    const stopThreat = entry && current && stop
      ? side === "SELL" || side === "SHORT" ? current >= stop : current <= stop
      : false;

    positionReview = {
      symbol: position.symbol ?? null,
      side: side || null,
      entry,
      current,
      stopLoss: stop,
      pnlPct: pnlPct == null ? null : Number(pnlPct.toFixed(2)),
      stopThreat,
      action: stopThreat ? ACTIONS.PROTECT : ACTIONS.EXIT_REVIEW,
      reason: stopThreat
        ? "Price is at or beyond the supplied stop-loss. Review risk immediately."
        : "Position remains open; continue monitoring invalidation and risk/reward.",
    };
  }

  const selected = candidates.find(
    c => String(c.symbol).toUpperCase() === String(ai.symbol ?? "").toUpperCase()
  ) ?? candidates[0] ?? null;

  return {
    success: true,
    copilotVersion: "2.0",
    action,
    symbol: selected?.symbol ?? null,
    regime: regime(candidates),
    confidence: ai.confidence ?? 0,
    risk: ai.risk ?? selected?.risk?.level ?? "HIGH",
    deterministic: {
      engineScore: selected?.engineScore ?? null,
      reasons: selected?.risk?.reasons ?? [],
      factors: factorState(selected),
    },
    ai,
    positionReview,
    explanation: buildExplanation(selected, action),
    candidates,
    generatedAt: new Date().toISOString(),
    execution: "READ_ONLY",
  };
}
