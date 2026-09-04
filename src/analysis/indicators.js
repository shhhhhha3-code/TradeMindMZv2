/**
 * TradeMindMZ V2 — Technical Indicator Engine
 *
 * Pure calculations only.
 * No network.
 * No trading.
 * No AI calls.
 */

function numbers(values) {
  return values
    .map(Number)
    .filter(Number.isFinite);
}

export function calculateSMA(values = [], period = 20) {
  const data = numbers(values);

  if (data.length < period) return null;

  const slice = data.slice(-period);

  return slice.reduce((sum, value) => sum + value, 0) / period;
}

export function calculateEMA(values = [], period = 20) {
  const data = numbers(values);

  if (data.length < period) return null;

  const multiplier = 2 / (period + 1);

  let ema =
    data.slice(0, period).reduce((sum, value) => sum + value, 0) /
    period;

  for (let i = period; i < data.length; i += 1) {
    ema =
      (data[i] - ema) * multiplier +
      ema;
  }

  return ema;
}

export function calculateRSI(values = [], period = 14) {
  const data = numbers(values);

  if (data.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const change = data[i] - data[i - 1];

    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  for (let i = period + 1; i < data.length; i += 1) {
    const change = data[i] - data[i - 1];

    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain =
      ((averageGain * (period - 1)) + gain) /
      period;

    averageLoss =
      ((averageLoss * (period - 1)) + loss) /
      period;
  }

  if (averageLoss === 0) return 100;

  const relativeStrength =
    averageGain / averageLoss;

  return 100 - (100 / (1 + relativeStrength));
}

export function calculateMACD(
  values = [],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
) {
  const data = numbers(values);

  if (data.length < slowPeriod + signalPeriod) {
    return null;
  }

  const fast = calculateEMA(data, fastPeriod);
  const slow = calculateEMA(data, slowPeriod);

  if (fast === null || slow === null) {
    return null;
  }

  const macd = fast - slow;

  /*
   * This is the current MACD line.
   * Full historical MACD series will be added
   * when the backtest dataset is connected.
   */
  return {
    macd,
    signal: null,
    histogram: null,
    signalPeriod,
  };
}

export function calculateIndicators(candles = []) {
  if (!Array.isArray(candles) || !candles.length) {
    return {
      rsi: null,
      macd: null,
      ema20: null,
      ema50: null,
      ema200: null,
    };
  }

  const closes = candles
    .map((candle) => Number(candle.close))
    .filter(Number.isFinite);

  return {
    rsi: calculateRSI(closes, 14),
    macd: calculateMACD(closes),
    ema20: calculateEMA(closes, 20),
    ema50: calculateEMA(closes, 50),
    ema200: calculateEMA(closes, 200),
  };
}
