import crypto from "node:crypto";

const MAX_OPEN_PAPER_TRADES = 20;
const DEFAULT_HORIZON_MINUTES = 60;

function now() {
  return Date.now();
}

function id() {
  return `paper_${now()}_${crypto
    .randomBytes(4)
    .toString("hex")}`;
}

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDirection(value) {
  const direction =
    String(value ?? "")
      .trim()
      .toUpperCase();

  if (
    direction === "BUY" ||
    direction === "LONG"
  ) {
    return "BUY";
  }

  if (
    direction === "SELL" ||
    direction === "SHORT"
  ) {
    return "SELL";
  }

  return "BUY";
}

function storageKey() {
  return "trademindmz-paper-trades";
}

function readTrades() {
  try {
    if (
      typeof localStorage !== "undefined"
    ) {
      const value =
        localStorage.getItem(
          storageKey()
        );

      return value
        ? JSON.parse(value)
        : [];
    }
  } catch {}

  return globalThis.__TRADEMINDMZ_PAPER_TRADES__ || [];
}

function writeTrades(trades) {
  try {
    if (
      typeof localStorage !== "undefined"
    ) {
      localStorage.setItem(
        storageKey(),
        JSON.stringify(trades)
      );
      return;
    }
  } catch {}

  globalThis.__TRADEMINDMZ_PAPER_TRADES__ =
    trades;
}

export function getPaperTrades() {
  return readTrades();
}

export function resetPaperTrades() {
  writeTrades([]);
  return [];
}

export function createPaperTrade({
  candidate,
  aiDecision = null,
  horizonMinutes =
    DEFAULT_HORIZON_MINUTES,
}) {
  if (!candidate) {
    throw new Error(
      "Paper trade requires a candidate."
    );
  }

  const trades = readTrades();

  const openCount =
    trades.filter(
      (trade) =>
        trade.status === "OPEN"
    ).length;

  if (
    openCount >=
    MAX_OPEN_PAPER_TRADES
  ) {
    throw new Error(
      "Maximum open paper trades reached."
    );
  }

  const entry = finite(
    candidate.entry ??
    candidate.price
  );

  const stopLoss = finite(
    candidate.stopLoss
  );

  const takeProfit = finite(
    candidate.takeProfit
  );

  if (
    entry === null ||
    entry <= 0
  ) {
    throw new Error(
      "Invalid paper trade entry."
    );
  }

  const trade = {
    id: id(),

    createdAt:
      new Date().toISOString(),

    horizonMinutes:

      finite(
        horizonMinutes,
        DEFAULT_HORIZON_MINUTES
      ),

    status: "OPEN",

    symbol:
      candidate.symbol ?? null,

    direction:
      normalizeDirection(
        candidate.direction ??
        candidate.trend ??
        "BUY"
      ),

    entry,

    stopLoss,

    takeProfit,

    engineScore:
      finite(
        candidate.engineScore ??
        candidate.score
      ),

    confidence:
      finite(
        candidate.confidence
      ),

    risk:
      candidate?.risk?.level ??
      candidate.risk ??
      "UNKNOWN",

    riskReward:
      finite(
        candidate.riskReward
      ),

    aiDecision:
      aiDecision?.decision ??
      null,

    aiProvider:
      aiDecision?.provider ??
      null,

    aiConfidence:
      finite(
        aiDecision?.confidence
      ),

    exit: null,

    result: null,

    pnlPercent: null,

    evaluationReason: null,

    evaluatedAt: null,
  };

  trades.unshift(trade);

  writeTrades(
    trades.slice(0, 500)
  );

  return trade;
}

export function evaluatePaperTrade(
  trade,
  currentPrice,
  at = now()
) {
  if (
    !trade ||
    trade.status !== "OPEN"
  ) {
    return trade;
  }

  const price =
    finite(currentPrice);

  if (
    price === null ||
    price <= 0
  ) {
    return trade;
  }

  const direction =
    normalizeDirection(
      trade.direction
    );

  let result = null;
  let reason = null;

  if (
    direction === "BUY" &&
    trade.stopLoss !== null &&
    price <= trade.stopLoss
  ) {
    result = "LOSS";
    reason = "STOP_LOSS";
  }

  if (
    direction === "BUY" &&
    trade.takeProfit !== null &&
    price >= trade.takeProfit
  ) {
    result = "WIN";
    reason = "TAKE_PROFIT";
  }

  if (
    direction === "SELL" &&
    trade.stopLoss !== null &&
    price >= trade.stopLoss
  ) {
    result = "LOSS";
    reason = "STOP_LOSS";
  }

  if (
    direction === "SELL" &&
    trade.takeProfit !== null &&
    price <= trade.takeProfit
  ) {
    result = "WIN";
    reason = "TAKE_PROFIT";
  }

  const created =
    new Date(
      trade.createdAt
    ).getTime();

  const horizon =
    finite(
      trade.horizonMinutes,
      DEFAULT_HORIZON_MINUTES
    );

  const expired =
    Number.isFinite(created) &&
    at >=
      created +
        horizon * 60_000;

  if (
    !result &&
    expired
  ) {
    result =
      direction === "BUY"
        ? price > trade.entry
          ? "WIN"
          : price < trade.entry
            ? "LOSS"
            : "FLAT"
        : price < trade.entry
          ? "WIN"
          : price > trade.entry
            ? "LOSS"
            : "FLAT";

    reason =
      "HORIZON_EXPIRED";
  }

  if (!result) {
    return trade;
  }

  const pnlPercent =
    direction === "BUY"
      ? ((price - trade.entry) /
          trade.entry) *
        100
      : ((trade.entry - price) /
          trade.entry) *
        100;

  return {
    ...trade,

    status: "CLOSED",

    exit: {
      price,
      time:
        new Date(at).toISOString(),
    },

    result,

    pnlPercent,

    evaluationReason:
      reason,

    evaluatedAt:
      new Date(at).toISOString(),
  };
}

export function evaluatePaperTrades(
  currentPrices = {}
) {
  const trades =
    readTrades();

  let changed = false;

  const evaluated =
    trades.map(
      (trade) => {
        if (
          trade.status !==
          "OPEN"
        ) {
          return trade;
        }

        const symbol =
          trade.symbol;

        const price =
          currentPrices[symbol];

        const result =
          evaluatePaperTrade(
            trade,
            price
          );

        if (
          JSON.stringify(result) !==
          JSON.stringify(trade)
        ) {
          changed = true;
        }

        return result;
      }
    );

  if (changed) {
    writeTrades(evaluated);
  }

  return evaluated;
}

export function getPaperStats() {
  const trades =
    readTrades();

  const closed =
    trades.filter(
      (trade) =>
        trade.status ===
        "CLOSED"
    );

  const wins =
    closed.filter(
      (trade) =>
        trade.result ===
        "WIN"
    );

  const losses =
    closed.filter(
      (trade) =>
        trade.result ===
        "LOSS"
    );

  const flats =
    closed.filter(
      (trade) =>
        trade.result ===
        "FLAT"
    );

  const pnl =
    closed.reduce(
      (sum, trade) =>
        sum +
        finite(
          trade.pnlPercent,
          0
        ),
      0
    );

  return {
    total:
      trades.length,

    open:
      trades.filter(
        (trade) =>
          trade.status ===
          "OPEN"
      ).length,

    closed:
      closed.length,

    wins:
      wins.length,

    losses:
      losses.length,

    flats:
      flats.length,

    winRate:
      closed.length
        ? Number(
            (
              wins.length /
              closed.length
            ).toFixed(4)
          )
        : 0,

    totalPnlPercent:
      Number(
        pnl.toFixed(4)
      ),
  };
}

export {
  MAX_OPEN_PAPER_TRADES,
  DEFAULT_HORIZON_MINUTES,
};
