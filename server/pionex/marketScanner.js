import {
  getMarketTickers,
  getMarketSymbols,
  getMarketKlines,
} from "./pionexClient.js";

/*
 * TradeMindMZ V2
 * Pionex → Local Market Scanner
 *
 * READ-ONLY.
 *
 * Pipeline:
 * Pionex
 * → market candidates
 * → technical analysis
 * → local score
 * → TOP 5
 *
 * AI is NOT called here.
 */

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function average(values) {
  const valid = values
    .map(Number)
    .filter(Number.isFinite);

  if (!valid.length) return 0;

  return (
    valid.reduce((sum, value) => sum + value, 0) /
    valid.length
  );
}

function ema(values, period) {
  if (!values.length) return null;

  const k = 2 / (period + 1);

  let result = values[0];

  for (let i = 1; i < values.length; i += 1) {
    result =
      values[i] * k +
      result * (1 - k);
  }

  return result;
}

function rsi(values, period = 14) {
  if (values.length < period + 1) {
    return 50;
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const diff =
      values[i] - values[i - 1];

    if (diff >= 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (
    let i = period + 1;
    i < values.length;
    i += 1
  ) {
    const diff =
      values[i] - values[i - 1];

    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain =
      ((avgGain * (period - 1)) + gain) /
      period;

    avgLoss =
      ((avgLoss * (period - 1)) + loss) /
      period;
  }

  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;

  return 100 - 100 / (1 + rs);
}

function macd(values) {
  if (values.length < 30) {
    return 0;
  }

  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);

  return ema12 - ema26;
}

function atr(closes, highs, lows, period = 14) {
  if (
    closes.length < 2 ||
    highs.length !== closes.length ||
    lows.length !== closes.length
  ) {
    return 0;
  }

  const trueRanges = [];

  for (let i = 1; i < closes.length; i += 1) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];

    trueRanges.push(
      Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      )
    );
  }

  return average(
    trueRanges.slice(-period)
  );
}

function parseKlines(payload) {
  const rows =
    payload?.data?.klines ??
    payload?.data ??
    payload?.klines ??
    [];

  if (!Array.isArray(rows)) {
    return [];
  }

  const parsed = rows
    .map((row) => {
      if (Array.isArray(row)) {
        return {
          time: number(row[0]),
          open: number(row[1]),
          high: number(row[2]),
          low: number(row[3]),
          close: number(row[4]),
          volume: number(row[5]),
        };
      }

      return {
        time: number(
          row.time ??
          row.timestamp ??
          row.openTime
        ),
        open: number(row.open),
        high: number(row.high),
        low: number(row.low),
        close: number(row.close),
        volume: number(
          row.volume ??
          row.quoteVolume
        ),
      };
    })
    .filter(
      (row) =>
        row.close > 0 &&
        row.high > 0 &&
        row.low > 0
    );

  // Pionex returns klines newest -> oldest.
  // The indicator engine expects oldest -> newest.
  return parsed.sort((a, b) => a.time - b.time);
}

function scoreCandidate({
  symbol,
  candles,
  ticker = {},
}) {
  if (candles.length < 40) {
    return null;
  }

  const closes =
    candles.map((c) => c.close);

  const highs =
    candles.map((c) => c.high);

  const lows =
    candles.map((c) => c.low);

  const volumes =
    candles.map((c) => c.volume);

  const price =
    closes[closes.length - 1];

  const ema9 =
    ema(closes, 9);

  const ema21 =
    ema(closes, 21);

  const rsi14 =
    rsi(closes, 14);

  const macdValue =
    macd(closes);

  const atrValue =
    atr(closes, highs, lows, 14);

  const recentVolume =
    average(volumes.slice(-5));

  const historicalVolume =
    average(volumes.slice(-25));

  const volumeRatio =
    historicalVolume > 0
      ? recentVolume / historicalVolume
      : 1;

  // Pionex 1D candles are daily candles.
  // Use the ticker's actual 24h open/close for 24h momentum.
  const tickerOpen = number(ticker.open, 0);
  const tickerClose = number(
    ticker.close,
    price
  );

  const change24h =
    tickerOpen > 0
      ? ((tickerClose - tickerOpen) / tickerOpen) * 100
      : 0;

  let bullish = 0;
  let bearish = 0;

  if (ema9 > ema21) {
    bullish += 1;
  } else {
    bearish += 1;
  }

  if (price > ema9) {
    bullish += 1;
  } else {
    bearish += 1;
  }

  if (macdValue > 0) {
    bullish += 1;
  } else {
    bearish += 1;
  }

  if (change24h > 0) {
    bullish += 1;
  } else {
    bearish += 1;
  }

  /*
   * Avoid buying extremely overbought markets.
   */
  if (rsi14 >= 70) {
    bullish -= 1;
  }

  /*
   * Oversold can be interesting for recovery setups.
   */
  if (rsi14 <= 35 && macdValue > 0) {
    bullish += 1;
  }

  const direction =
    bullish >= bearish
      ? "BUY"
      : "SELL";

  const trendScore =
    ema9 > ema21
      ? 25
      : 10;

  const momentumScore =
    direction === "BUY"
      ? Math.min(
          25,
          Math.max(
            0,
            12.5 + change24h * 1.5
          )
        )
      : Math.min(
          25,
          Math.max(
            0,
            12.5 - change24h * 1.5
          )
        );

  const volumeScore =
    volumeRatio >= 1.5
      ? 15
      : volumeRatio >= 1.1
        ? 12
        : volumeRatio >= 0.8
          ? 8
          : 4;

  const rsiScore =
    rsi14 >= 40 && rsi14 <= 65
      ? 15
      : rsi14 > 65 && rsi14 < 75
        ? 10
        : 7;

  const volatilityPct =
    price > 0
      ? (atrValue / price) * 100
      : 0;

  const volatilityScore =
    volatilityPct >= 0.5 &&
    volatilityPct <= 5
      ? 10
      : 5;

  const rawScore =
    trendScore +
    momentumScore +
    volumeScore +
    rsiScore +
    volatilityScore;

  const score =
    Math.max(
      0,
      Math.min(100, Math.round(rawScore))
    );

  const stopDistance =
    Math.max(
      atrValue * 1.5,
      price * 0.01
    );

  const targetDistance =
    stopDistance * 2;

  const entry =
    price;

  const stopLoss =
    direction === "BUY"
      ? price - stopDistance
      : price + stopDistance;

  const takeProfit =
    direction === "BUY"
      ? price + targetDistance
      : price - targetDistance;

  const riskReward =
    stopDistance > 0
      ? targetDistance / stopDistance
      : 0;

  const confidence =
    Math.round(
      Math.max(
        0,
        Math.min(
          100,
          55 +
            Math.abs(
              bullish - bearish
            ) * 8 +
            (volumeRatio > 1.1 ? 7 : 0)
        )
      )
    );

  return {
    symbol,
    direction,
    score,
    confidence,

    entry,
    stopLoss,
    takeProfit,
    riskReward,

    price,

    indicators: {
      rsi14,
      ema9,
      ema21,
      macd: macdValue,
      atr: atrValue,
      atrPct: volatilityPct,
      volumeRatio,
      change24h,
    },

    ticker,

    reasoning:
      direction === "BUY"
        ? "Bullish EMA structure with supportive momentum and volume."
        : "Bearish EMA structure with weakening momentum and volume.",

    scannedAt:
      new Date().toISOString(),
  };
}

function extractTickerRows(payload) {
  return (
    payload?.data?.tickers ??
    payload?.data ??
    payload?.tickers ??
    []
  );
}

function extractSymbols(payload) {
  const rows =
    payload?.data?.symbols ??
    payload?.data ??
    payload?.symbols ??
    [];

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows;
}

function isUsdtSymbol(symbol) {
  const s =
    String(symbol || "").toUpperCase();

  return (
    s.includes("USDT") &&
    !s.includes("USDC") &&
    !s.includes("BUSD")
  );
}

function getSymbolValue(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined) {
      return row[key];
    }
  }

  return null;
}

export async function scanPionexMarket({
  interval = "1D",
  candleLimit = 100,
  maxMarkets = 25,
} = {}) {
  const [tickerPayload, symbolPayload] =
    await Promise.all([
      getMarketTickers(),
      getMarketSymbols(),
    ]);

  const tickers =
    extractTickerRows(tickerPayload);

  const symbols =
    extractSymbols(symbolPayload);

  const tickerMap = new Map();

  for (const ticker of tickers) {
    const symbol = String(
      getSymbolValue(ticker, [
        "symbol",
        "market",
      ]) || ""
    ).toUpperCase();

    if (!symbol) continue;

    tickerMap.set(
      symbol,
      ticker
    );
  }

  const marketNames = symbols
    .map((row) =>
      String(
        getSymbolValue(row, [
          "symbol",
          "market",
        ]) || ""
      ).toUpperCase()
    )
    .filter(isUsdtSymbol);

  const tickerNames =
    [...tickerMap.keys()]
      .filter(isUsdtSymbol);

  const universe =
    [
      ...new Set([
        ...marketNames,
        ...tickerNames,
      ]),
    ];

  const rankedUniverse =
    universe
      .map((symbol) => ({
        symbol,
        ticker: tickerMap.get(symbol) || {},
        volume:
          number(
            getSymbolValue(
              tickerMap.get(symbol),
              [
                "volume24h",
                "quoteVolume",
                "amount",
                "volume",
              ]
            )
          ),
      }))
      .sort(
        (a, b) =>
          b.volume - a.volume
      )
      .slice(
        0,
        Math.max(
          5,
          Math.min(maxMarkets, 50)
        )
      );

  const candidates = [];

  for (const item of rankedUniverse) {
    try {
      const payload =
        await getMarketKlines({
          symbol: item.symbol,
          interval,
          limit: candleLimit,
        });

      const candles =
        parseKlines(payload);

      const candidate =
        scoreCandidate({
          symbol: item.symbol,
          candles,
          ticker: item.ticker,
        });

      if (candidate) {
        candidates.push(candidate);
      }
    } catch (error) {
      console.warn(
        `Scanner skipped ${item.symbol}:`,
        error?.message || error
      );
    }
  }

  const topFive =
    candidates
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return (
          b.confidence -
          a.confidence
        );
      })
      .slice(0, 5);

  return {
    success: true,
    scanned:
      rankedUniverse.length,
    candidates: topFive,
    updatedAt:
      new Date().toISOString(),
  };
}
