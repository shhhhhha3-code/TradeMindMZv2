import {
  normalizeSignal,
} from "./signalEngine";

export function createSignalViewModel(
  result = {}
) {
  if (
    !result ||
    result.success !== true ||
    !result.signal
  ) {
    return {
      available: false,
      status:
        result.status ||
        "NO_SIGNAL",
      provider:
        result.provider || null,
      signal: null,
    };
  }

  const signal =
    normalizeSignal(result.signal);

  return {
    available: true,
    status:
      result.status ||
      "AI_ANALYZED",
    provider:
      result.provider || null,
    signal,
  };
}

export function getRecommendationLabel(
  recommendation
) {
  switch (recommendation) {
    case "BUY":
      return "BUY";
    case "SELL":
      return "SELL";
    case "HOLD":
      return "HOLD";
    case "NO_TRADE":
      return "NO TRADE";
    default:
      return "NO SIGNAL";
  }
}

export function getSignalDirection(
  direction
) {
  switch (direction) {
    case "LONG":
      return "LONG";
    case "SHORT":
      return "SHORT";
    default:
      return "NEUTRAL";
  }
}
