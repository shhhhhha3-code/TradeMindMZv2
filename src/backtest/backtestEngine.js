import { analyzeMarket } from "../analysis/marketAnalysis";

export function runBacktest({
  candles = [],
  lookahead = 10,
  minimumScore = 65,
} = {}) {
  if (
    !Array.isArray(candles) ||
    candles.length <= lookahead
  ) {
    return {
      trades: [],
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      averageReturn: 0,
    };
  }

  const trades = [];

  for (
    let i = 200;
    i < candles.length - lookahead;
    i += 1
  ) {
    const history = candles.slice(0, i + 1);

    const analysis = analyzeMarket(history);

    if (
      analysis.direction !== "LONG" ||
      analysis.score < minimumScore
    ) {
      continue;
    }

    const entry = Number(
      candles[i]?.close
    );

    const future = Number(
      candles[i + lookahead]?.close
    );

    if (
      !Number.isFinite(entry) ||
      !Number.isFinite(future) ||
      entry <= 0
    ) {
      continue;
    }

    const returnPercent =
      ((future - entry) / entry) * 100;

    trades.push({
      timestamp: candles[i]?.timestamp || null,
      entry,
      exit: future,
      returnPercent,
      result:
        returnPercent > 0
          ? "WIN"
          : returnPercent < 0
            ? "LOSS"
            : "FLAT",
      score: analysis.score,
      confidence: analysis.confidence,
    });
  }

  const wins = trades.filter(
    (trade) => trade.result === "WIN"
  ).length;

  const losses = trades.filter(
    (trade) => trade.result === "LOSS"
  ).length;

  const totalReturn = trades.reduce(
    (sum, trade) =>
      sum + trade.returnPercent,
    0
  );

  return {
    trades,
    totalTrades: trades.length,
    wins,
    losses,
    winRate:
      trades.length > 0
        ? (wins / trades.length) * 100
        : 0,
    averageReturn:
      trades.length > 0
        ? totalReturn / trades.length
        : 0,
  };
}
