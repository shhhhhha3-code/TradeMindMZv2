import { calculateIndicators } from "./indicators";

export function analyzeMarket(candles = []) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      direction: "NEUTRAL",
      score: 0,
      confidence: 0,
      indicators: {
        rsi: null,
        macd: null,
        ema20: null,
        ema50: null,
        ema200: null,
      },
      reasons: [],
    };
  }

  const indicators = calculateIndicators(candles);

  const latest = Number(
    candles[candles.length - 1]?.close
  );

  let score = 50;
  const reasons = [];

  if (
    Number.isFinite(latest) &&
    indicators.ema20 !== null
  ) {
    if (latest > indicators.ema20) {
      score += 8;
      reasons.push("Price above EMA20");
    } else {
      score -= 8;
      reasons.push("Price below EMA20");
    }
  }

  if (
    Number.isFinite(latest) &&
    indicators.ema50 !== null
  ) {
    if (latest > indicators.ema50) {
      score += 10;
      reasons.push("Price above EMA50");
    } else {
      score -= 10;
      reasons.push("Price below EMA50");
    }
  }

  if (
    Number.isFinite(latest) &&
    indicators.ema200 !== null
  ) {
    if (latest > indicators.ema200) {
      score += 12;
      reasons.push("Price above EMA200");
    } else {
      score -= 12;
      reasons.push("Price below EMA200");
    }
  }

  if (indicators.rsi !== null) {
    if (indicators.rsi < 30) {
      score += 8;
      reasons.push("RSI indicates oversold conditions");
    } else if (indicators.rsi > 70) {
      score -= 8;
      reasons.push("RSI indicates overbought conditions");
    }
  }

  score = Math.max(0, Math.min(100, score));

  let direction = "NEUTRAL";

  if (score >= 65) {
    direction = "LONG";
  } else if (score <= 35) {
    direction = "SHORT";
  }

  const confidence =
    Math.abs(score - 50) * 2;

  return {
    direction,
    score,
    confidence: Math.round(
      Math.max(0, Math.min(100, confidence))
    ),
    indicators,
    reasons,
  };
}
