const DEFAULT_CRITERIA = Object.freeze({
  minimumScore: 75,
  minimumConfidence: 80,
  minimumRiskReward: 2,
  minimumRsi: 35,
  maximumRsi: 70,
  minimumVolumeRatio: 0.8,
});

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeTradeCriteria(criteria = {}) {
  return {
    minimumScore: finite(criteria.minimumScore) ?? DEFAULT_CRITERIA.minimumScore,
    minimumConfidence: finite(criteria.minimumConfidence) ?? DEFAULT_CRITERIA.minimumConfidence,
    minimumRiskReward: finite(criteria.minimumRiskReward) ?? DEFAULT_CRITERIA.minimumRiskReward,
    minimumRsi: finite(criteria.minimumRsi) ?? DEFAULT_CRITERIA.minimumRsi,
    maximumRsi: finite(criteria.maximumRsi) ?? DEFAULT_CRITERIA.maximumRsi,
    minimumVolumeRatio: finite(criteria.minimumVolumeRatio) ?? DEFAULT_CRITERIA.minimumVolumeRatio,
  };
}

export function evaluateEntryEligibility(values = {}, criteria = {}) {
  const c = normalizeTradeCriteria(criteria);
  const score = finite(values.engineScore);
  const confidence = finite(values.confidence);
  const rr = finite(values.riskReward);
  const rsi = finite(values.rsi);
  const volume = finite(values.volumeRatio);
  const risk = String(values.riskLevel || values.risk || "").toUpperCase();
  const engineDecision = String(values.engineDecision || "").toUpperCase();
  const dataQuality = String(values.dataQualityStatus || values.dataQuality || "").toUpperCase();
  const mtfStatus = String(values.mtfStatus || "").toUpperCase();
  const mtfAlignment = String(values.mtfAlignment || "").toUpperCase();

  const checks = [
    { key: "score", label: "Engine score", actual: score, target: c.minimumScore, passed: score !== null && score >= c.minimumScore },
    { key: "confidence", label: "Market confidence", actual: confidence, target: c.minimumConfidence, passed: confidence !== null && confidence >= c.minimumConfidence },
    { key: "riskReward", label: "Risk / Reward", actual: rr, target: c.minimumRiskReward, passed: rr !== null && rr >= c.minimumRiskReward },
    { key: "rsi", label: "RSI", actual: rsi, target: `${c.minimumRsi}–${c.maximumRsi}`, passed: rsi !== null && rsi >= c.minimumRsi && rsi <= c.maximumRsi },
    { key: "volume", label: "Volume", actual: volume, target: c.minimumVolumeRatio, passed: volume !== null && volume >= c.minimumVolumeRatio },
  ];

  if (risk === "HIGH" || risk === "CRITICAL") {
    checks.push({
      key: "risk",
      label: "Market risk",
      actual: risk,
      target: "LOW / MEDIUM",
      passed: false,
    });
  }

  if (["TRADE", "WATCH", "NO_TRADE", "INSUFFICIENT_DATA"].includes(engineDecision)) {
    checks.push({
      key: "engineDecision",
      label: "Engine decision",
      actual: engineDecision,
      target: "TRADE",
      passed: engineDecision === "TRADE",
    });
  }

  if (dataQuality === "INSUFFICIENT") {
    checks.push({
      key: "dataQuality",
      label: "Market data quality",
      actual: "INSUFFICIENT",
      target: "SUFFICIENT",
      passed: false,
    });
  }

  if (mtfStatus === "INSUFFICIENT") {
    checks.push({
      key: "mtfStatus",
      label: "Multi-timeframe confirmation",
      actual: "INSUFFICIENT",
      target: "SUFFICIENT",
      passed: false,
    });
  }

  if (mtfAlignment === "CONFLICTING") {
    checks.push({
      key: "mtfAlignment",
      label: "Higher timeframe alignment",
      actual: "CONFLICTING",
      target: "ALIGNED / MIXED",
      passed: false,
    });
  }

  const failedChecks = checks.filter(check => !check.passed);
  const hasData = [score, confidence, rr, rsi, volume].every(value => value !== null);

  return {
    status: !hasData ? "UNKNOWN" : failedChecks.length ? "NOT_ELIGIBLE" : "ELIGIBLE",
    checks,
    failedChecks,
    criteria: c,
  };
}

export function getPositionStatus(analysis = {}, pnlPercent = null) {
  const recommendation = String(analysis?.recommendation || "WAITING").toUpperCase();
  const risk = String(analysis?.riskLevel || "UNKNOWN").toUpperCase();
  const confidence = finite(analysis?.confidence);
  const delta = finite(analysis?.confidenceDelta);

  if (recommendation === "WAITING" || !analysis?.analyzedAt) {
    return { key: "WAITING", label: "WAITING", className: "neutral" };
  }

  if (recommendation === "EXIT_CONSIDERATION" || risk === "CRITICAL") {
    return { key: "EXIT_CONSIDERATION", label: "EXIT CONSIDERATION", className: "negative" };
  }

  if (
    recommendation === "REDUCE_RISK" ||
    risk === "HIGH" ||
    (delta !== null && delta <= -10)
  ) {
    return { key: "REDUCE_RISK", label: "REDUCE RISK", className: "warning" };
  }

  if (
    recommendation === "WATCH" ||
    (confidence !== null && confidence < 60) ||
    (finite(pnlPercent) !== null && Number(pnlPercent) < 0)
  ) {
    return { key: "HOLD_WITH_CAUTION", label: "HOLD WITH CAUTION", className: "warning" };
  }

  return { key: "HOLD", label: "HOLD", className: "positive" };
}

export function buildPositionDecisionSummary({ analysis = {}, pnlPercent = null, market = {}, criteria = {} } = {}) {
  const positionStatus = getPositionStatus(analysis, pnlPercent);
  const entryStatus = evaluateEntryEligibility({
    engineScore: market.engineScore,
    confidence: market.confidence,
    riskReward: market.riskReward,
    rsi: market.rsi,
    volumeRatio: market.volumeRatio,
    riskLevel: market.riskLevel,
    engineDecision: market.engineDecision,
    dataQualityStatus: market.dataQualityStatus,
    mtfStatus: market.mtfStatus,
    mtfAlignment: market.mtfAlignment,
  }, criteria);

  return {
    positionStatus,
    entryStatus,
    riskAction: String(analysis?.recommendation || "WAITING").toUpperCase(),
  };
}
