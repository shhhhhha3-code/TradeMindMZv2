import {
  rankRecommendedSignals,
  selectBestSignal,
} from "./signalService";

export function runSignalEngineSelfTest() {
  const signals = [
    {
      symbol: "BTCUSDT",
      direction: "BUY",
      score: 82,
      confidence: 78,
    },
    {
      symbol: "ETHUSDT",
      direction: "BUY",
      score: 74,
      confidence: 90,
    },
    {
      symbol: "SOLUSDT",
      direction: "HOLD",
      score: 50,
      confidence: 50,
    },
  ];

  const ranked =
    rankRecommendedSignals(
      signals
    );

  const best =
    selectBestSignal(
      signals
    );

  return {
    passed:
      ranked.length === 3 &&
      best?.symbol === "BTCUSDT",

    ranked,
    best,
  };
}
