import {
  normalizeMarketData,
  normalizeHistoricalData,
  getLatestCandle,
} from "./marketData";
import { supabase } from "../db/supabase";

/**
 * TradeMindMZ V2 — Market Data Service
 *
 * Responsibilities:
 * - Normalize market data
 * - Read/write historical candles
 * - Cache recent market data
 * - Provide a clean interface for future providers
 *
 * IMPORTANT:
 * - No trading
 * - No Pionex orders
 * - No AI calls
 * - No API keys in frontend
 */

const CACHE_PREFIX = "trademindmz-market-";
const CACHE_TTL = 60 * 1000;

function cacheKey(symbol, timeframe) {
  return `${CACHE_PREFIX}${symbol}-${timeframe}`;
}

export function getCachedMarketData(symbol, timeframe = "1h") {
  try {
    const raw = localStorage.getItem(
      cacheKey(symbol, timeframe)
    );

    if (!raw) return null;

    const cached = JSON.parse(raw);

    if (
      !cached.timestamp ||
      Date.now() - cached.timestamp > CACHE_TTL
    ) {
      localStorage.removeItem(
        cacheKey(symbol, timeframe)
      );
      return null;
    }

    return cached.data || null;
  } catch {
    return null;
  }
}

export function setCachedMarketData(
  symbol,
  timeframe,
  data
) {
  try {
    localStorage.setItem(
      cacheKey(symbol, timeframe),
      JSON.stringify({
        timestamp: Date.now(),
        data,
      })
    );
  } catch {
    // Cache failure must never break trading analysis.
  }
}

export async function getHistoricalCandles({
  symbol,
  timeframe = "1h",
  limit = 500,
} = {}) {
  if (!supabase || !symbol) {
    return [];
  }

  const safeLimit = Math.max(
    1,
    Math.min(Number(limit) || 500, 5000)
  );

  const { data, error } = await supabase
    .from("market_candles")
    .select(
      "symbol,timeframe,candle_time,open,high,low,close,volume,rsi,macd,ema20,ema50,ema200"
    )
    .eq("symbol", symbol)
    .eq("timeframe", timeframe)
    .order("candle_time", {
      ascending: false,
    })
    .limit(safeLimit);

  if (error) {
    console.error(
      "TradeMindMZ historical candle error:",
      error
    );

    return [];
  }

  return normalizeHistoricalData(
    (data || [])
      .reverse()
      .map((row) => ({
        timestamp: row.candle_time,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      }))
  );
}

export async function getLatestHistoricalCandle({
  symbol,
  timeframe = "1h",
} = {}) {
  const candles = await getHistoricalCandles({
    symbol,
    timeframe,
    limit: 2,
  });

  return getLatestCandle(candles);
}

export async function saveHistoricalCandles(
  candles = []
) {
  if (!supabase || !Array.isArray(candles) || !candles.length) {
    return {
      success: false,
      saved: 0,
      error: "No database or candle data.",
    };
  }

  const rows = candles
    .map((candle) => ({
      symbol: candle.symbol,
      timeframe: candle.timeframe || "1h",
      candle_time:
        candle.candle_time ||
        candle.timestamp,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume:
        candle.volume == null
          ? null
          : Number(candle.volume),

      rsi:
        candle.rsi == null
          ? null
          : Number(candle.rsi),

      macd:
        candle.macd == null
          ? null
          : Number(candle.macd),

      ema20:
        candle.ema20 == null
          ? null
          : Number(candle.ema20),

      ema50:
        candle.ema50 == null
          ? null
          : Number(candle.ema50),

      ema200:
        candle.ema200 == null
          ? null
          : Number(candle.ema200),
    }))
    .filter(
      (row) =>
        row.symbol &&
        row.candle_time &&
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close)
    );

  if (!rows.length) {
    return {
      success: false,
      saved: 0,
      error: "No valid candles.",
    };
  }

  const { error } = await supabase
    .from("market_candles")
    .upsert(rows, {
      onConflict:
        "symbol,timeframe,candle_time",
      ignoreDuplicates: false,
    });

  if (error) {
    console.error(
      "TradeMindMZ candle save error:",
      error
    );

    return {
      success: false,
      saved: 0,
      error: error.message,
    };
  }

  return {
    success: true,
    saved: rows.length,
    error: null,
  };
}

export function normalizeCurrentMarketData(data = {}) {
  const normalized =
    normalizeMarketData(data);

  if (
    normalized.symbol &&
    normalized.price !== null
  ) {
    setCachedMarketData(
      normalized.symbol,
      normalized.timeframe,
      normalized
    );
  }

  return normalized;
}

export function getMarketDataStatus({
  symbol,
  timeframe = "1h",
} = {}) {
  const cached =
    getCachedMarketData(
      symbol,
      timeframe
    );

  return {
    symbol: symbol || null,
    timeframe,
    cached: Boolean(cached),
    price: cached?.price ?? null,
    timestamp: cached?.timestamp ?? null,
  };
}
