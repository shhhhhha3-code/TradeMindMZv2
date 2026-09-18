function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function evaluateRisk(market) {
  const rsi = finite(market?.rsi);
  const rr = finite(market?.riskReward);
  const volumeRatio = finite(
    market?.volumeRatio
  );
  const score = finite(
    market?.engineScore
  );

  const reasons = [];
  let points = 0;

  if (
    rsi !== null &&
    (rsi >= 78 || rsi <= 22)
  ) {
    points += 3;
    reasons.push("EXTREME_RSI");
  }

  if (
    rr !== null &&
    rr < 2
  ) {
    points += 2;
    reasons.push("LOW_RISK_REWARD");
  }

  if (
    volumeRatio !== null &&
    volumeRatio < 0.8
  ) {
    points += 2;
    reasons.push("LOW_VOLUME");
  }

  if (
    score !== null &&
    score < 60
  ) {
    points += 2;
    reasons.push("LOW_ENGINE_SCORE");
  }

  let level = "LOW";

  if (points >= 5) {
    level = "HIGH";
  } else if (points >= 2) {
    level = "MEDIUM";
  }

  return {
    level,
    points,
    reasons,
  };
}

export function addRiskAssessment(market) {
  return {
    ...market,
    risk: evaluateRisk(market),
  };
}
