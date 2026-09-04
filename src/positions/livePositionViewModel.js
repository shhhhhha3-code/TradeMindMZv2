export function buildLivePositionViewModel(position = {}) {
  const analysis = position.aiAnalysis || {};

  return {
    id: position.id || null,

    symbol: position.symbol || null,

    side:
      position.side ||
      "LONG",

    entryPrice:
      Number(position.entryPrice) || null,

    quantity:
      Number(position.quantity) || null,

    status:
      position.status ||
      "LIVE",

    recommendation:
      analysis.recommendation ||
      "HOLD",

    confidence:
      Number(analysis.confidence) || 0,

    reasoning:
      analysis.reasoning ||
      "",

    risk:
      analysis.risk ||
      null,

    analyzedAt:
      analysis.analyzedAt ||
      null,

    aiStatus:
      analysis.status ||
      "NOT_ANALYZED",
  };
}

export function buildLivePositionSummary(
  positions = []
) {
  const normalized = positions.map(
    buildLivePositionViewModel
  );

  return {
    total: normalized.length,

    live:
      normalized.filter(
        (position) =>
          position.status === "LIVE"
      ).length,

    hold:
      normalized.filter(
        (position) =>
          position.recommendation === "HOLD"
      ).length,

    watch:
      normalized.filter(
        (position) =>
          position.recommendation === "WATCH"
      ).length,

    risk:
      normalized.filter(
        (position) =>
          position.recommendation ===
          "REDUCE_RISK"
      ).length,

    exitConsideration:
      normalized.filter(
        (position) =>
          position.recommendation ===
          "EXIT_CONSIDERATION"
      ).length,

    positions: normalized,
  };
}
