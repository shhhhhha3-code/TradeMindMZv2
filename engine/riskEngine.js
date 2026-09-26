function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function evaluateRisk(market) {
  const rsi = finite(market?.rsi);
  const rr = finite(market?.riskReward);
  const volumeRatio = finite(market?.volumeRatio);
  const score = finite(market?.engineScore);
  const atrPct = finite(
    market?.atrPct ??
    market?.indicators?.atrPct
  );

  const reasons = [];
  let points = 0;

  if (rsi !== null && (rsi >= 78 || rsi <= 22)) {
    points += 3;
    reasons.push("EXTREME_RSI");
  }

  if (rr !== null && rr < 2) {
    points += 2;
    reasons.push("LOW_RISK_REWARD");
  }

  if (volumeRatio !== null && volumeRatio < 0.8) {
    points += 2;
    reasons.push("LOW_VOLUME");
  }

  if (score !== null && score < 60) {
    points += 2;
    reasons.push("LOW_ENGINE_SCORE");
  }

  if (atrPct !== null && atrPct > 5) {
    points += 3;
    reasons.push("HIGH_VOLATILITY");
  } else if (atrPct !== null && atrPct < 0.2) {
    points += 1;
    reasons.push("VERY_LOW_VOLATILITY");
  }

  const level =
    points >= 6
      ? "HIGH"
      : points >= 2
        ? "MEDIUM"
        : "LOW";

  return { level, points, reasons };
}

export function assessDataQuality(market) {
  const required = {
    price: finite(market?.price),
    rsi: finite(market?.rsi),
    volumeRatio: finite(market?.volumeRatio),
    riskReward: finite(market?.riskReward),
    direction: String(market?.direction ?? "").toUpperCase(),
  };

  const missing = Object.entries(required)
    .filter(([key, value]) => {
      if (key === "direction") {
        return !["BUY", "SELL", "LONG", "SHORT"].includes(value);
      }
      return value === null;
    })
    .map(([key]) => key);

  const warnings = [];

  const atrPct = finite(
    market?.atrPct ??
    market?.indicators?.atrPct
  );

  if (atrPct === null) {
    warnings.push("ATR_VOLATILITY_UNAVAILABLE");
  }

  return {
    status: missing.length ? "INSUFFICIENT" : warnings.length ? "DEGRADED" : "GOOD",
    missing,
    warnings,
  };
}

export function addRiskAssessment(market) {
  return {
    ...market,
    risk: evaluateRisk(market),
    dataQuality: assessDataQuality(market),
  };
}
