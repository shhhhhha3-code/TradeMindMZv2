export const SIGNAL_STATUS = {
  AI_DISABLED: "AI_DISABLED",
  NO_PROVIDER: "NO_PROVIDER",
  ANALYSIS_FAILED: "ANALYSIS_FAILED",
  SIGNAL_READY: "SIGNAL_READY",
};

export function isRecommendedSignal(signal) {
  if (!signal) return false;

  return (
    signal.direction === "BUY" &&
    Number(signal.score) >= 75 &&
    Number(signal.confidence) >= 60
  );
}

export function getRecommendationLabel(signal) {
  if (!signal) {
    return "NO SIGNAL";
  }

  if (
    signal.direction === "BUY" &&
    signal.score >= 75
  ) {
    return "BEST RECOMMENDED";
  }

  if (signal.direction === "SELL") {
    return "SELL / AVOID";
  }

  if (signal.direction === "HOLD") {
    return "HOLD";
  }

  return "WAIT";
}
