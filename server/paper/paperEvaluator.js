import {
  getMarketTickers,
} from "../pionex/pionexClient.js";

import {
  evaluatePaperTrades,
  getPaperTrades,
  getPaperStats,
} from "./paperTrading.js";

function finite(
  value,
  fallback = null
) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function symbolOf(ticker = {}) {
  return String(
    ticker.symbol ??
    ticker.market ??
    ticker.symbolName ??
    ""
  )
    .trim()
    .toUpperCase();
}

function priceOf(ticker = {}) {
  return finite(
    ticker.close ??
    ticker.last ??
    ticker.price ??
    ticker.closePrice ??
    ticker.lastPrice
  );
}

function directionOf(trade) {
  const direction =
    String(
      trade?.direction ?? ""
    )
      .trim()
      .toUpperCase();

  if (
    direction === "SELL" ||
    direction === "SHORT"
  ) {
    return "SELL";
  }

  return "BUY";
}

function unrealizedPnl(
  trade,
  currentPrice
) {
  const entry =
    finite(trade?.entry);

  const price =
    finite(currentPrice);

  if (
    entry === null ||
    price === null ||
    entry <= 0
  ) {
    return null;
  }

  const direction =
    directionOf(trade);

  if (direction === "SELL") {
    return (
      ((entry - price) /
        entry) *
      100
    );
  }

  return (
    ((price - entry) /
      entry) *
    100
  );
}

function buildPriceMap(
  tickers
) {
  const map = {};

  if (!Array.isArray(tickers)) {
    return map;
  }

  for (
    const ticker of tickers
  ) {
    const symbol =
      symbolOf(ticker);

    const price =
      priceOf(ticker);

    if (
      symbol &&
      price !== null &&
      price > 0
    ) {
      map[symbol] = price;
    }
  }

  return map;
}

function parseTickers(payload) {
  const rows =
    payload?.data?.tickers ??
    payload?.data ??
    payload?.tickers ??
    [];

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows;
}

export async function evaluatePaperTradesLive() {
  const wallet =
    await getMarketTickers();

  const tickers =
    parseTickers(wallet);

  const prices =
    buildPriceMap(tickers);

  const before =
    getPaperTrades();

  const evaluated =
    evaluatePaperTrades(
      prices
    );

  const now =
    evaluated.map(
      (trade) => {
        const currentPrice =
          prices[
            String(
              trade.symbol ?? ""
            ).toUpperCase()
          ] ??
          null;

        return {
          ...trade,

          currentPrice,

          unrealizedPnlPercent:
            trade.status ===
            "OPEN"
              ? unrealizedPnl(
                  trade,
                  currentPrice
                )
              : null,
        };
      }
    );

  const closedBefore =
    before.filter(
      (trade) =>
        trade.status === "CLOSED"
    ).length;

  const closedAfter =
    evaluated.filter(
      (trade) =>
        trade.status === "CLOSED"
    ).length;

  return {
    success: true,

    updatedAt:
      new Date().toISOString(),

    tickerCount:
      tickers.length,

    priceCount:
      Object.keys(prices).length,

    closedNow:
      Math.max(
        0,
        closedAfter -
          closedBefore
      ),

    trades:
      now,

    stats:
      getPaperStats(),
  };
}

export async function getLivePaperSnapshot() {
  const wallet =
    await getMarketTickers();

  const tickers =
    parseTickers(wallet);

  const prices =
    buildPriceMap(tickers);

  const trades =
    getPaperTrades();

  return {
    success: true,

    updatedAt:
      new Date().toISOString(),

    tickerCount:
      tickers.length,

    priceCount:
      Object.keys(prices).length,

    trades:
      trades.map(
        (trade) => {
          const currentPrice =
            prices[
              String(
                trade.symbol ?? ""
              ).toUpperCase()
            ] ??
            null;

          return {
            ...trade,

            currentPrice,

            unrealizedPnlPercent:
              trade.status ===
              "OPEN"
                ? unrealizedPnl(
                    trade,
                    currentPrice
                  )
                : null,
          };
        }
      ),

    stats:
      getPaperStats(),
  };
}
