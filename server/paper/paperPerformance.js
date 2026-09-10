import { getPaperTrades } from "./paperTrading.js";

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((numberOrZero(value) + Number.EPSILON) * factor) / factor;
}

function getResult(trade) {
  const explicit = String(trade?.result || "").toUpperCase();

  if (["WIN", "WON", "PROFIT"].includes(explicit)) return "WIN";
  if (["LOSS", "LOST", "STOP"].includes(explicit)) return "LOSS";
  if (["FLAT", "BREAKEVEN", "BREAK_EVEN"].includes(explicit)) return "FLAT";

  const pnl = Number(trade?.pnlPercent);

  if (Number.isFinite(pnl)) {
    if (pnl > 0) return "WIN";
    if (pnl < 0) return "LOSS";
    return "FLAT";
  }

  return "UNKNOWN";
}

function getPnl(trade) {
  return Number.isFinite(Number(trade?.pnlPercent))
    ? Number(trade.pnlPercent)
    : 0;
}

function summarize(trades) {
  const total = trades.length;

  const open = trades.filter(
    (trade) => trade?.status === "OPEN"
  );

  const closed = trades.filter(
    (trade) => trade?.status === "CLOSED"
  );

  const wins = closed.filter(
    (trade) => getResult(trade) === "WIN"
  );

  const losses = closed.filter(
    (trade) => getResult(trade) === "LOSS"
  );

  const flats = closed.filter(
    (trade) => getResult(trade) === "FLAT"
  );

  const totalPnl = closed.reduce(
    (sum, trade) => sum + getPnl(trade),
    0
  );

  const grossProfit = wins.reduce(
    (sum, trade) => sum + Math.max(0, getPnl(trade)),
    0
  );

  const grossLoss = losses.reduce(
    (sum, trade) => sum + Math.min(0, getPnl(trade)),
    0
  );

  const avgWin = wins.length
    ? wins.reduce((sum, trade) => sum + getPnl(trade), 0) / wins.length
    : 0;

  const avgLoss = losses.length
    ? losses.reduce((sum, trade) => sum + getPnl(trade), 0) / losses.length
    : 0;

  const avgPnl = closed.length
    ? totalPnl / closed.length
    : 0;

  let profitFactor = 0;

  if (grossLoss < 0) {
    profitFactor =
      grossProfit / Math.abs(grossLoss);
  } else if (grossProfit > 0) {
    profitFactor = null;
  }

  return {
    total,
    open: open.length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,

    winRate: closed.length
      ? round((wins.length / closed.length) * 100)
      : 0,

    lossRate: closed.length
      ? round((losses.length / closed.length) * 100)
      : 0,

    totalPnlPercent: round(totalPnl),
    avgPnlPercent: round(avgPnl),
    avgWinPercent: round(avgWin),
    avgLossPercent: round(avgLoss),

    grossProfitPercent: round(grossProfit),
    grossLossPercent: round(grossLoss),

    profitFactor:
      profitFactor === null
        ? null
        : round(profitFactor),

    expectancyPercent: round(avgPnl)
  };
}

function describeTrade(trade) {
  if (!trade) return null;

  return {
    id: trade.id,
    symbol: trade.symbol,
    direction: trade.direction,
    entry: trade.entry,
    exit: trade.exit,
    pnlPercent: round(getPnl(trade)),
    result: getResult(trade),
    createdAt: trade.createdAt || null,
    evaluatedAt: trade.evaluatedAt || null,
    evaluationReason:
      trade.evaluationReason || null,

    engineScore:
      numberOrZero(trade.engineScore),

    confidence:
      numberOrZero(trade.confidence),

    risk:
      trade.risk || null,

    riskReward:
      numberOrZero(trade.riskReward),

    aiDecision:
      trade.aiDecision || null,

    aiProvider:
      trade.aiProvider || null,

    aiConfidence:
      numberOrZero(trade.aiConfidence)
  };
}

function bestTrade(closed) {
  if (!closed.length) return null;

  return describeTrade(
    [...closed].sort(
      (a, b) => getPnl(b) - getPnl(a)
    )[0]
  );
}

function worstTrade(closed) {
  if (!closed.length) return null;

  return describeTrade(
    [...closed].sort(
      (a, b) => getPnl(a) - getPnl(b)
    )[0]
  );
}

function groupBy(closed, selector) {
  const groups = new Map();

  for (const trade of closed) {
    const key =
      String(selector(trade) || "UNKNOWN");

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(trade);
  }

  return [...groups.entries()]
    .map(([key, trades]) => ({
      key,
      ...summarize(trades)
    }))
    .sort((a, b) => {
      if (b.closed !== a.closed) {
        return b.closed - a.closed;
      }

      return (
        b.totalPnlPercent -
        a.totalPnlPercent
      );
    });
}

function buildHistory(closed, limit) {
  return [...closed]
    .sort(
      (a, b) =>
        new Date(
          b.evaluatedAt ||
          b.createdAt ||
          0
        ).getTime() -
        new Date(
          a.evaluatedAt ||
          a.createdAt ||
          0
        ).getTime()
    )
    .slice(0, limit)
    .map(describeTrade);
}

export function getPaperPerformance({
  limit = 50
} = {}) {
  const trades = getPaperTrades();

  const closed = trades.filter(
    (trade) => trade?.status === "CLOSED"
  );

  const safeLimit = Math.min(
    Math.max(Number(limit) || 50, 1),
    500
  );

  return {
    success: true,

    generatedAt:
      new Date().toISOString(),

    overall:
      summarize(trades),

    closedSummary:
      summarize(closed),

    bestTrade:
      bestTrade(closed),

    worstTrade:
      worstTrade(closed),

    bySymbol:
      groupBy(
        closed,
        (trade) => trade.symbol
      ),

    byAIProvider:
      groupBy(
        closed,
        (trade) => trade.aiProvider
      ),

    byDirection:
      groupBy(
        closed,
        (trade) => trade.direction
      ),

    history:
      buildHistory(
        closed,
        safeLimit
      )
  };
}
