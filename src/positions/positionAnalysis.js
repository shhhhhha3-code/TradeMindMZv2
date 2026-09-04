/**
 * TradeMindMZ V2 — AI Position Monitor
 *
 * Analyses an already-open position.
 *
 * IMPORTANT:
 * - Never places orders.
 * - Never closes positions.
 * - Never modifies Pionex.
 * - AI only produces a recommendation.
 */

const VALID_RECOMMENDATIONS = [
  "HOLD",
  "WATCH",
  "REDUCE_RISK",
  "EXIT_CONSIDERATION",
  "NO_TRADE",
];

export function normalizePositionRecommendation(
  recommendation = {}
) {
  const normalized =
    String(
      recommendation.recommendation || "NO_TRADE"
    ).toUpperCase();

  return {
    recommendation:
      VALID_RECOMMENDATIONS.includes(normalized)
        ? normalized
        : "NO_TRADE",

    confidence:
      clamp(
        recommendation.confidence,
        0,
        100
      ),

    reasoning:
      String(
        recommendation.reasoning || ""
      ),

    riskLevel:
      String(
        recommendation.riskLevel || "UNKNOWN"
      ).toUpperCase(),

    stopLoss:
      numberOrNull(
        recommendation.stopLoss
      ),

    takeProfit:
      numberOrNull(
        recommendation.takeProfit
      ),

    timestamp:
      recommendation.timestamp ||
      new Date().toISOString(),
  };
}

export function evaluatePositionLocally({
  side = "LONG",
  entryPrice,
  currentPrice,
  stopLoss,
  takeProfit,
}) {
  const entry = Number(entryPrice);
  const current = Number(currentPrice);
  const sl = Number(stopLoss);
  const tp = Number(takeProfit);

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(current) ||
    entry <= 0
  ) {
    return {
      recommendation: "NO_TRADE",
      confidence: 0,
      riskLevel: "UNKNOWN",
      reasoning:
        "Insufficient position data.",
    };
  }

  const performance =
    side === "SHORT"
      ? ((entry - current) / entry) * 100
      : ((current - entry) / entry) * 100;

  if (
    Number.isFinite(sl) &&
    (
      side === "LONG"
        ? current <= sl
        : current >= sl
    )
  ) {
    return {
      recommendation:
        "EXIT_CONSIDERATION",
      confidence: 95,
      riskLevel: "HIGH",
      reasoning:
        "Current price has reached the configured stop-loss level.",
      stopLoss: sl,
      takeProfit:
        Number.isFinite(tp) ? tp : null,
    };
  }

  if (
    Number.isFinite(tp) &&
    (
      side === "LONG"
        ? current >= tp
        : current <= tp
    )
  ) {
    return {
      recommendation: "WATCH",
      confidence: 90,
      riskLevel: "LOW",
      reasoning:
        "Current price has reached the configured take-profit level.",
      stopLoss:
        Number.isFinite(sl) ? sl : null,
      takeProfit: tp,
    };
  }

  if (performance <= -5) {
    return {
      recommendation: "REDUCE_RISK",
      confidence: 85,
      riskLevel: "HIGH",
      reasoning:
        "Position drawdown is significant and risk should be reassessed.",
    };
  }

  if (performance >= 5) {
    return {
      recommendation: "HOLD",
      confidence: 75,
      riskLevel: "MEDIUM",
      reasoning:
        "Position is currently profitable. Continue monitoring market conditions.",
    };
  }

  return {
    recommendation: "HOLD",
    confidence: 60,
    riskLevel: "MEDIUM",
    reasoning:
      "Position remains within a normal monitoring range.",
  };
}

function numberOrNull(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function clamp(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.max(
    min,
    Math.min(max, number)
  );
}
