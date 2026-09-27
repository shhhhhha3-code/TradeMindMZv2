import {
  getMarketDepth,
  getMarketTrades,
  getFuturesIndexes,
  getOpenInterests,
} from "./pionexClient.js";

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sumLevels(levels = [], limit = 10) {
  return levels
    .slice(0, limit)
    .reduce((sum, level) => {
      const size = finite(level?.[1], 0);
      return sum + size;
    }, 0);
}

function parseDepth(payload) {
  const data = payload?.data ?? {};
  const bids = Array.isArray(data.bids) ? data.bids : [];
  const asks = Array.isArray(data.asks) ? data.asks : [];
  const bestBid = finite(bids[0]?.[0]);
  const bestAsk = finite(asks[0]?.[0]);
  const bidSize = sumLevels(bids);
  const askSize = sumLevels(asks);
  const total = bidSize + askSize;

  return {
    bestBid,
    bestAsk,
    bidDepth: bidSize,
    askDepth: askSize,
    orderbookImbalance: total > 0 ? (bidSize - askSize) / total : null,
    spreadBps:
      bestBid !== null &&
      bestAsk !== null &&
      bestBid > 0 &&
      bestAsk >= bestBid
        ? ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 10000
        : null,
    updateTime: finite(data.updateTime),
  };
}

function parseTrades(payload) {
  const trades = Array.isArray(payload?.data?.trades)
    ? payload.data.trades
    : [];

  let buySize = 0;
  let sellSize = 0;

  for (const trade of trades) {
    const size = finite(trade?.size, 0);
    if (String(trade?.side || "").toUpperCase() === "BUY") buySize += size;
    if (String(trade?.side || "").toUpperCase() === "SELL") sellSize += size;
  }

  const total = buySize + sellSize;

  return {
    tradeCount: trades.length,
    takerBuySize: buySize,
    takerSellSize: sellSize,
    takerBuyRatio: total > 0 ? buySize / total : null,
    takerVolumeImbalance: total > 0 ? (buySize - sellSize) / total : null,
    latestTradeTime: finite(trades[0]?.timestamp),
  };
}

function indexForSymbol(payload, symbol) {
  const rows = Array.isArray(payload?.data?.indexes)
    ? payload.data.indexes
    : [];
  return rows.find((row) => String(row?.symbol || "").toUpperCase() === String(symbol).toUpperCase()) || null;
}

function openInterestForSymbol(payload, symbol) {
  const rows = Array.isArray(payload?.data?.openInterests)
    ? payload.data.openInterests
    : [];
  return rows.find((row) => String(row?.symbol || "").toUpperCase() === String(symbol).toUpperCase()) || null;
}

export async function captureMarketMicrostructure(
  candidates = [],
  {
    maxDetailedSymbols = 3,
    marketType = "PERP",
  } = {}
) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return {};

  const normalizedMarketType =
    String(marketType || "PERP").toUpperCase() === "SPOT"
      ? "SPOT"
      : "PERP";

  const [indexesResult, openInterestResult] =
    normalizedMarketType === "PERP"
      ? await Promise.allSettled([
          getFuturesIndexes(),
          getOpenInterests(),
        ])
      : [
          { status: "fulfilled", value: null },
          { status: "fulfilled", value: null },
        ];

  const indexes =
    indexesResult.status === "fulfilled"
      ? indexesResult.value
      : null;

  const openInterests =
    openInterestResult.status === "fulfilled"
      ? openInterestResult.value
      : null;

  const result = {};

  for (const candidate of list.slice(0, Math.max(1, maxDetailedSymbols))) {
    const symbol = candidate?.symbol;
    if (!symbol) continue;

    const [depthResult, tradesResult] = await Promise.allSettled([
      getMarketDepth({ symbol, limit: 20 }),
      getMarketTrades({ symbol, limit: 100 }),
    ]);

    const depth = depthResult.status === "fulfilled" ? parseDepth(depthResult.value) : {};
    const trades = tradesResult.status === "fulfilled" ? parseTrades(tradesResult.value) : {};
    const index = indexForSymbol(indexes, symbol);
    const openInterest = openInterestForSymbol(openInterests, symbol);

    const price = finite(candidate.price);
    const indexPrice = finite(index?.indexPrice);
    const markPrice = finite(index?.markPrice);

    result[symbol] = {
      symbol,
      marketType: normalizedMarketType,
      capturedAt: new Date().toISOString(),
      ...depth,
      ...trades,
      indexPrice,
      markPrice,
      nextFundingRate: finite(index?.nextFundingRate),
      nextFundingTime: finite(index?.nextFundingTime),
      openInterest: finite(openInterest?.openInterest),
      indexBasisPct:
        price !== null && indexPrice > 0
          ? ((price - indexPrice) / indexPrice) * 100
          : null,
      markBasisPct:
        price !== null && markPrice > 0
          ? ((price - markPrice) / markPrice) * 100
          : null,
      source: "Pionex public market API",
    };
  }

  return result;
}
