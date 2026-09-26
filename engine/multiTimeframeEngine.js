function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const TIMEFRAME_WEIGHTS = {
  "15M": 0.2,
  "60M": 0.35,
  "4H": 0.45,
};

function normalizeTimeframe(value) {
  return String(value ?? "").toUpperCase();
}

function directionOf(snapshot) {
  const value = String(
    snapshot?.direction ??
    snapshot?.trend ??
    ""
  ).toUpperCase();

  if (
    value === "BUY" ||
    value === "LONG" ||
    value.includes("BULL") ||
    value === "UP"
  ) {
    return "BUY";
  }

  if (
    value === "SELL" ||
    value === "SHORT" ||
    value.includes("BEAR") ||
    value === "DOWN"
  ) {
    return "SELL";
  }

  return "NEUTRAL";
}

function timeframeQuality(snapshot) {
  const rsi = finite(snapshot?.rsi);
  const macd = finite(snapshot?.macd);
  const ema9 = finite(snapshot?.ema9);
  const ema21 = finite(snapshot?.ema21);

  return (
    rsi !== null &&
    macd !== null &&
    ema9 !== null &&
    ema21 !== null
  );
}

function alignmentFor(direction, snapshot) {
  const tfDirection = directionOf(snapshot);

  if (
    direction === "NEUTRAL" ||
    tfDirection === "NEUTRAL"
  ) {
    return "NEUTRAL";
  }

  return tfDirection === direction
    ? "ALIGNED"
    : "OPPOSED";
}

function weightedAlignment(direction, timeframes) {
  let availableWeight = 0;
  let alignedWeight = 0;
  let opposedWeight = 0;

  for (const [rawTf, weight] of Object.entries(TIMEFRAME_WEIGHTS)) {
    const tf = normalizeTimeframe(rawTf);
    const snapshot = timeframes?.[tf];

    if (!snapshot || !timeframeQuality(snapshot)) {
      continue;
    }

    availableWeight += weight;

    const alignment = alignmentFor(direction, snapshot);

    if (alignment === "ALIGNED") {
      alignedWeight += weight;
    } else if (alignment === "OPPOSED") {
      opposedWeight += weight;
    }
  }

  if (!availableWeight) {
    return {
      availableWeight: 0,
      alignedWeight: 0,
      opposedWeight: 0,
      score: 0,
    };
  }

  return {
    availableWeight,
    alignedWeight,
    opposedWeight,
    score: Math.round(
      (alignedWeight / availableWeight) * 100
    ),
  };
}

/**
 * Build 2 multi-timeframe confirmation.
 *
 * Higher timeframes have more influence than the execution timeframe:
 * 15M = 20%, 60M = 35%, 4H = 45%.
 *
 * This is confirmation only. It never places orders and it never replaces
 * the deterministic engine's hard safety gates.
 */
export function buildMultiTimeframeSnapshot(
  market = {}
) {
  const direction = directionOf(market);
  const supplied = market?.timeframes ?? {};

  const timeframes = {};

  for (const timeframe of ["15M", "60M", "4H"]) {
    const source = supplied[timeframe] ?? supplied[timeframe.toLowerCase()];

    if (!source) {
      timeframes[timeframe] = null;
      continue;
    }

    const tfDirection = directionOf(source);

    timeframes[timeframe] = {
      timeframe,
      direction: tfDirection,
      trend: String(
        source?.trend ?? tfDirection
      ).toUpperCase(),
      rsi: finite(source?.rsi),
      macd: finite(source?.macd),
      ema9: finite(source?.ema9),
      ema21: finite(source?.ema21),
      atrPct: finite(source?.atrPct),
      change: finite(
        source?.change24h ??
        source?.change
      ),
      dataQuality: timeframeQuality(source)
        ? "GOOD"
        : "INSUFFICIENT",
    };
  }

  const alignment = weightedAlignment(
    direction,
    timeframes
  );

  const availableCount = Object.values(timeframes)
    .filter(Boolean)
    .length;

  const goodCount = Object.values(timeframes)
    .filter(
      (snapshot) =>
        snapshot?.dataQuality === "GOOD"
    )
    .length;

  let status = "INSUFFICIENT";
  if (goodCount === 3) status = "GOOD";
  else if (goodCount >= 2) status = "DEGRADED";

  let alignmentState = "UNKNOWN";

  if (alignment.availableWeight > 0) {
    if (alignment.alignedWeight >= 0.7 * alignment.availableWeight) {
      alignmentState = "ALIGNED";
    } else if (alignment.opposedWeight >= 0.7 * alignment.availableWeight) {
      alignmentState = "CONFLICTING";
    } else {
      alignmentState = "MIXED";
    }
  }

  const conflictPenalty =
    alignmentState === "CONFLICTING"
      ? 25
      : alignmentState === "MIXED"
        ? 8
        : 0;

  const score =
    status === "INSUFFICIENT"
      ? 0
      : Math.max(
          0,
          Math.min(
            100,
            alignment.score - conflictPenalty
          )
        );

  const confirmation =
    alignmentState === "ALIGNED"
      ? "STRONG"
      : alignmentState === "MIXED"
        ? "MIXED"
        : alignmentState === "CONFLICTING"
          ? "CONFLICTING"
          : "UNAVAILABLE";

  return {
    direction,
    status,
    confirmation,
    alignment: alignmentState,
    score,
    availableTimeframes: availableCount,
    confirmedTimeframes: goodCount,
    weights: TIMEFRAME_WEIGHTS,
    timeframes,
  };
}
