import crypto from "node:crypto";

import {
  getPionexConfig,
  isPionexConfigured,
} from "./pionexConfig.js";

/*
 * TradeMindMZ V2 — Pionex READ-ONLY client
 *
 * IMPORTANT:
 * - GET requests only
 * - NO order creation
 * - NO cancel
 * - NO execution
 * - NO trading
 */

function buildSignature({
  method,
  path,
  queryString = "",
}) {
  const config = getPionexConfig();

  const pathUrl =
    queryString
      ? `${path}?${queryString}`
      : path;

  const message =
    `${method}${pathUrl}`;

  return crypto
    .createHmac("sha256", config.apiSecret)
    .update(message)
    .digest("hex");
}


async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryDelay(response, attempt) {
  const retryAfter = response?.headers?.get?.("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds)) {
      return Math.min(
        Math.max(seconds * 1000, 1000),
        30000
      );
    }
  }

  return Math.min(
    1500 * Math.pow(2, attempt),
    12000
  );
}

async function request(path, query = {}) {
  const config = getPionexConfig();

  if (!isPionexConfigured()) {
    throw new Error(
      "Pionex API credentials are not configured."
    );
  }

  const timestamp = Date.now().toString();

  const params = new URLSearchParams({
    ...query,
    timestamp,
  });

  const queryString =
    [...params.entries()]
      .sort(([a], [b]) =>
        a.localeCompare(b)
      )
      .map(
        ([key, value]) =>
          `${key}=${value}`
      )
      .join("&");

  const signature = buildSignature({
    method: "GET",
    path,
    queryString,
  });

  const url =
    `${config.baseUrl}${path}?${queryString}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "PIONEX-KEY": config.apiKey,
      "PIONEX-SIGNATURE": signature,
    },
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Pionex request failed: ${response.status} ${text}`
    );
  }

  return response.json();
}

/*
 * Public market GET.
 *
 * No credentials required.
 */
async function publicRequest(path, query = {}) {
  const queryString =
    new URLSearchParams(query).toString();

  const url =
    `${getPionexConfig().baseUrl}${path}` +
    (queryString ? `?${queryString}` : "");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Pionex market request failed: ${response.status} ${text}`
    );
  }

  return response.json();
}

/*
 * Account / balance.
 */
export async function getAccountInfo() {
  return request(
    "/api/v1/account/balances"
  );
}

/*
 * Full wallet balance overview.
 *
 * Includes Spot/Bot Account and Futures/Trader Account.
 * READ ONLY.
 */
export async function getWalletBalancesFull() {
  return request(
    "/api/v1/wallet/balancesFull"
  );
}

/*
 * USDT-M futures positions.
 *
 * IMPORTANT:
 * /api/v1/account/positions is NOT the correct
 * endpoint for the USDT-M position feed.
 *
 * Use the uapi endpoint.
 */
export async function getOpenPositions() {
  return request(
    "/uapi/v1/account/positions"
  );
}

/*
 * Public ticker feed.
 */
export async function getMarketTickers() {
  return publicRequest(
    "/api/v1/market/tickers"
  );
}

/*
 * Public symbol list.
 */
export async function getMarketSymbols() {
  return publicRequest(
    "/api/v1/common/symbols"
  );
}

/*
 * Public OHLCV candles.
 */
export async function getMarketKlines({
  symbol,
  interval = "1D",
  limit = 200,
} = {}) {
  if (!symbol) {
    throw new Error(
      "Symbol is required for market klines."
    );
  }

  return publicRequest(
    "/api/v1/market/klines",
    {
      symbol,
      interval,
      limit: String(limit),
    }
  );
}
