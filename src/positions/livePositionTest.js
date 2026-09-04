import {
  buildLivePositionViewModel,
  buildLivePositionSummary,
} from "./livePositionViewModel.js";

export function runLivePositionTest() {
  const positions = [
    {
      id: "test-1",
      symbol: "BTCUSDT",
      side: "LONG",
      entryPrice: 100000,
      quantity: 0.01,
      status: "LIVE",
      aiAnalysis: {
        recommendation: "HOLD",
        confidence: 82,
        reasoning:
          "Trend remains constructive.",
        status: "ANALYZED",
      },
    },
  ];

  const summary =
    buildLivePositionSummary(
      positions
    );

  if (
    summary.total !== 1 ||
    summary.live !== 1 ||
    summary.hold !== 1
  ) {
    throw new Error(
      "Live position pipeline test failed."
    );
  }

  return summary;
}
