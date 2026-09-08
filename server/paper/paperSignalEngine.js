import {
  createPaperTrade,
  getPaperTrades,
} from "./paperTrading.js";

import {
  recordSignal,
  evaluateTradeStability,
} from "./signalStability.js";

function finite(value, fallback = null) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function findCandidate(
  engineTop5 = [],
  symbol = null
) {
  if (!Array.isArray(engineTop5)) {
    return null;
  }

  if (symbol) {
    const exact =
      engineTop5.find(
        (candidate) =>
          candidate?.symbol === symbol
      );

    if (exact) {
      return exact;
    }
  }

  return engineTop5[0] || null;
}

function firstFinite(...values) {
  for (const value of values) {
    const n = Number(value);

    if (
      Number.isFinite(n) &&
      n > 0
    ) {
      return n;
    }
  }

  return null;
}

function resolvePrice(
  snapshot = {},
  candidate = null,
  aiDecision = {}
) {
  const raw =
    candidate?.raw ??
    candidate?.market ??
    candidate?.ticker ??
    {};

  return firstFinite(
    aiDecision?.price,
    aiDecision?.entry,

    candidate?.entry,
    candidate?.price,
    candidate?.currentPrice,
    candidate?.current_price,
    candidate?.lastPrice,
    candidate?.last_price,
    candidate?.close,
    candidate?.last,

    raw?.entry,
    raw?.price,
    raw?.currentPrice,
    raw?.current_price,
    raw?.lastPrice,
    raw?.last_price,
    raw?.close,
    raw?.last,

    snapshot?.entry,
    snapshot?.price,
    snapshot?.currentPrice,
    snapshot?.current_price,
    snapshot?.lastPrice,
    snapshot?.last_price,

    snapshot?.ticker?.close,
    snapshot?.ticker?.last,
    snapshot?.ticker?.price,

    snapshot?.market?.price,
    snapshot?.market?.close,
    snapshot?.market?.last,

    snapshot?.engineRecommendation?.entry,
    snapshot?.engineRecommendation?.price,
    snapshot?.engineRecommendation?.currentPrice
  );
}

function normalizePaperDirection(
  value
) {
  const direction =
    String(value ?? "")
      .trim()
      .toUpperCase();

  if (
    direction === "SELL" ||
    direction === "SHORT" ||
    direction === "BEARISH" ||
    direction === "BEAR"
  ) {
    return "SELL";
  }

  return "BUY";
}

function hasOpenPaperTrade(symbol) {
  return getPaperTrades().some(
    (trade) =>
      trade.status === "OPEN" &&
      trade.symbol === symbol
  );
}

export function processPaperSignal({
  scanResult,
  aiDecision,
}) {
  const result =
    scanResult || {};

  const ai =
    aiDecision || {};

  const engineTop5 =
    Array.isArray(
      result.engineTop5
    )
      ? result.engineTop5
      : [];

  const finalDecision =
    String(
      result.finalDecision ??
      ai.decision ??
      result.engineDecision ??
      "NO_TRADE"
    )
      .trim()
      .toUpperCase();

  const symbol =
    ai.symbol ??
    result.engineRecommendation?.symbol ??
    engineTop5[0]?.symbol ??
    null;

  const candidate =
    findCandidate(
      engineTop5,
      symbol
    );

  const resolvedPrice =
    resolvePrice(
      result,
      candidate,
      ai
    );

  const resolvedDirection =
    normalizePaperDirection(
      ai.direction ??
      candidate?.direction ??
      candidate?.trend ??
      null
    );

  const signal =
    recordSignal({
      finalDecision,
      symbol,

      direction:
        resolvedDirection,

      price:
        resolvedPrice,

      engineScore:
        candidate?.engineScore ??
        candidate?.score ??
        null,

      confidence:
        ai.confidence ??
        candidate?.confidence ??
        null,

      risk:
        ai.risk ??
        candidate?.risk?.level ??
        candidate?.risk ??
        "UNKNOWN",

      riskReward:
        candidate?.riskReward ??
        null,

      rsi:
        candidate?.rsi ??
        null,

      volumeRatio:
        candidate?.volumeRatio ??
        null,

      aiDecision: ai,
    });

  const stability =
    symbol
      ? evaluateTradeStability(
          symbol,
          2
        )
      : {
          stable: false,
          consecutive: 0,
          required: 2,
        };

  let paperTrade = null;

  /*
   * SAFETY:
   * - Only open PAPER trades.
   * - Never create a real Pionex order.
   * - Require two consecutive TRADE signals.
   * - Never duplicate an existing open paper trade.
   */
  if (
    finalDecision === "TRADE" &&
    symbol &&
    candidate &&
    stability.stable &&
    !hasOpenPaperTrade(symbol)
  ) {
    try {
      paperTrade =
        createPaperTrade({
          candidate: {
            ...candidate,

            symbol:
              candidate.symbol ??
              symbol,

            entry:
              firstFinite(
                candidate.entry,
                candidate.price,
                candidate.currentPrice,
                candidate.current_price,
                resolvedPrice
              ),

            price:
              firstFinite(
                candidate.price,
                candidate.currentPrice,
                candidate.current_price,
                resolvedPrice
              ),

            direction:
              normalizePaperDirection(
                candidate.direction ??
                candidate.trend ??
                ai.direction
              ),
          },

          aiDecision,

          horizonMinutes: 60,
        });
    } catch (error) {
      paperTrade = {
        error:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }

  return {
    signal,
    stability,
    paperTrade,
  };
}
