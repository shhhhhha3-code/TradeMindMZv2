import { getSupabaseClient } from "../supabase/client.js";
import { getPaperTrades } from "../paper/paperTrading.js";

const MATCH_WINDOW_MS = 10 * 60_000;
const MAX_CANDIDATES = 500;

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function direction(value) {
  const v = normalize(value);
  if (["SELL", "SHORT", "BEARISH", "DOWN"].includes(v)) return "SELL";
  return "BUY";
}

function timestamp(value) {
  const t = new Date(value ?? "").getTime();
  return Number.isFinite(t) ? t : null;
}

function compatible(decision, trade) {
  return normalize(decision.symbol) === normalize(trade.symbol)
    && direction(decision.direction ?? decision.ai_result?.direction) === direction(trade.direction);
}

function distance(decision, trade) {
  const a = timestamp(decision.created_at);
  const b = timestamp(trade.createdAt);
  if (a === null || b === null) return Infinity;
  return Math.abs(a - b);
}

function resolvedStatus(trade) {
  const result = normalize(trade?.result);
  if (result === "WIN") return "WIN";
  if (result === "LOSS") return "LOSS";
  if (result === "FLAT") return "FLAT";
  return null;
}

function buildOutcome(trade) {
  const status = resolvedStatus(trade);
  if (!status) return null;

  const created = timestamp(trade.createdAt);
  const evaluated = timestamp(trade.evaluatedAt);
  const holdingMinutes =
    created !== null && evaluated !== null
      ? Math.max(0, (evaluated - created) / 60_000)
      : null;

  return {
    outcome_status: status,
    outcome_result: status,
    outcome_return_pct: finite(trade.pnlPercent),
    outcome_reason: trade.evaluationReason ?? null,
    paper_trade_id: trade.id ?? null,
    outcome_at: trade.evaluatedAt ?? null,
    holding_minutes: holdingMinutes,
  };
}

async function fetchMemoryRows(limit = 500) {
  const supabase = getSupabaseClient();
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 5000);
  const { data, error } = await supabase
    .from("ai_copilot_history")
    .select("id,decision_id,symbol,action,confidence,risk,regime,ai_result,created_at,outcome_status,outcome_result,outcome_return_pct,outcome_reason,paper_trade_id,outcome_at,holding_minutes")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function reconcileCopilotDecisionMemory({ limit = 500 } = {}) {
  try {
    const supabase = getSupabaseClient();
    const [decisions, trades] = await Promise.all([
      fetchMemoryRows(limit),
      Promise.resolve(getPaperTrades()),
    ]);

    const closedTrades = trades
      .filter(trade => trade?.status === "CLOSED" && resolvedStatus(trade))
      .slice(0, MAX_CANDIDATES);

    const usedTradeIds = new Set(
      decisions.map(row => row.paper_trade_id).filter(Boolean),
    );

    let resolved = 0;

    for (const decision of decisions) {
      if (normalize(decision.outcome_status) !== "PENDING") continue;

      const matches = closedTrades
        .filter(trade => !usedTradeIds.has(trade.id))
        .filter(trade => compatible(decision, trade))
        .map(trade => ({ trade, distance: distance(decision, trade) }))
        .filter(item => item.distance <= MATCH_WINDOW_MS)
        .sort((a, b) => a.distance - b.distance);

      const best = matches[0]?.trade;
      if (!best) continue;

      const outcome = buildOutcome(best);
      if (!outcome) continue;

      const { error } = await supabase
        .from("ai_copilot_history")
        .update(outcome)
        .eq("id", decision.id);

      if (error) {
        console.warn("[TradeMindMZ Copilot] decision memory update skipped:", error.message);
        continue;
      }

      usedTradeIds.add(best.id);
      resolved += 1;
    }

    return {
      success: true,
      inspectedDecisions: decisions.length,
      inspectedPaperTrades: closedTrades.length,
      resolved,
      pending: Math.max(0, decisions.filter(d => normalize(d.outcome_status) === "PENDING").length - resolved),
      mode: "PAPER_ONLY",
    };
  } catch (error) {
    return {
      success: false,
      resolved: 0,
      error: error?.message ?? String(error),
      mode: "PAPER_ONLY",
    };
  }
}

export async function getCopilotDecisionMemoryStats() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("ai_copilot_decision_memory_stats")
      .select("*")
      .single();

    if (error) throw error;

    return {
      success: true,
      stats: data,
      mode: "PAPER_ONLY",
    };
  } catch (error) {
    return {
      success: false,
      stats: null,
      error: error?.message ?? String(error),
      mode: "PAPER_ONLY",
    };
  }
}
