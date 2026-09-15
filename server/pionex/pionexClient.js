import crypto from "node:crypto";

import {
  getPionexConfig,
  isPionexConfigured,
} from "./pionexConfig.js";

const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 4;
const MIN_REQUEST_GAP_MS = 350;

let lastRequestAt = 0;

const responseCache = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cacheKey(path, query) {
  return `${path}?${new URLSearchParams(query).toString()}`;
}

function getCached(key, ttlMs) {
  const entry = responseCache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp > ttlMs) {
    responseCache.delete(key);
    return null;
  }

  return entry.value;
}

function setCached(key, value) {
  responseCache.set(key, {
    timestamp: Date.now(),
    value,
  });
}

async function respectRequestGap() {
  const elapsed = Date.now() - lastRequestAt;

  if (elapsed < MIN_REQUEST_GAP_MS) {
    await sleep(
      MIN_REQUEST_GAP_MS - elapsed
    );
  }

  lastRequestAt = Date.now();
}

function getRetryDelay(response, attempt) {
  const retryAfter =
    response?.headers?.get?.("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds)) {
      return Math.min(
        Math.max(seconds * 1000, 1500),
        30000
      );
    }
  }

  return Math.min(
    2000 * Math.pow(2, attempt),
    30000
  );
}

async function fetchWithTimeout(
  url,
  options
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal,
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildSignature({
  method,
  path,
  queryString = "",
}) {
  const config =
    getPionexConfig();

  const pathUrl =
    queryString
      ? `${path}?${queryString}`
      : path;

  const message =
    `${method}${pathUrl}`;

  return crypto
    .createHmac(
      "sha256",
      config.apiSecret
    )
    .update(message)
    .digest("hex");
}

function buildQuery(query = {}) {
  const params =
    new URLSearchParams({
      ...query,
      timestamp:
        Date.now().toString(),
    });

  return [...params.entries()]
    .sort(([a], [b]) =>
      a.localeCompare(b)
    )
    .map(
      ([key, value]) =>
        `${key}=${value}`
    )
    .join("&");
}

async function request(
  path,
  query = {},
  {
    cacheTtlMs = 0,
  } = {}
) {
  const config =
    getPionexConfig();

  if (!isPionexConfigured()) {
    throw new Error(
      "Pionex API credentials are not configured."
    );
  }

  const staticQuery = {
    ...query,
  };

  const key =
    cacheKey(path, staticQuery);

  if (cacheTtlMs > 0) {
    const cached =
      getCached(
        key,
        cacheTtlMs
      );

    if (cached !== null) {
      return cached;
    }
  }

  for (
    let attempt = 0;
    attempt < MAX_RETRIES;
    attempt += 1
  ) {
    await respectRequestGap();

    const queryString =
      buildQuery(
        query
      );

    const signature =
      buildSignature({
        method: "GET",
        path,
        queryString,
      });

    const url =
      `${config.baseUrl}${path}?${queryString}`;

    let response;

    try {
      response =
        await fetchWithTimeout(
          url,
          {
            method: "GET",
            headers: {
              "Content-Type":
                "application/json",
              "PIONEX-KEY":
                config.apiKey,
              "PIONEX-SIGNATURE":
                signature,
            },
          }
        );
    } catch (error) {
      if (
        attempt <
        MAX_RETRIES - 1
      ) {
        const delay =
          Math.min(
            2000 *
              Math.pow(
                2,
                attempt
              ),
            15000
          );

        console.warn(
          `[Pionex] network/timeout on ${path}. ` +
          `Retry in ${delay}ms.`
        );

        await sleep(delay);
        continue;
      }

      throw error;
    }

    if (response.ok) {
      const json =
        await response.json();

      if (cacheTtlMs > 0) {
        setCached(
          key,
          json
        );
      }

      return json;
    }

    const text =
      await response.text();

    if (
      response.status === 429 &&
      attempt <
        MAX_RETRIES - 1
    ) {
      const delay =
        getRetryDelay(
          response,
          attempt
        );

      console.warn(
        `[Pionex] 429 on ${path}. ` +
        `Retry ${attempt + 1}/${MAX_RETRIES - 1} ` +
        `in ${delay}ms.`
      );

      await sleep(delay);

      continue;
    }

    const error =
      new Error(
        `Pionex request failed: ` +
        `${response.status} ${text}`
      );

    error.status =
      response.status;

    error.code =
      response.status === 429
        ? "PIONEX_RATE_LIMITED"
        : "PIONEX_REQUEST_FAILED";

    throw error;
  }

  throw new Error(
    "Pionex request failed after retries."
  );
}

async function publicRequest(
  path,
  query = {},
  {
    cacheTtlMs = 0,
  } = {}
) {
  const config =
    getPionexConfig();

  const key =
    cacheKey(path, query);

  if (cacheTtlMs > 0) {
    const cached =
      getCached(
        key,
        cacheTtlMs
      );

    if (cached !== null) {
      return cached;
    }
  }

  for (
    let attempt = 0;
    attempt < MAX_RETRIES;
    attempt += 1
  ) {
    await respectRequestGap();

    const queryString =
      new URLSearchParams(
        query
      ).toString();

    const url =
      `${config.baseUrl}${path}` +
      (
        queryString
          ? `?${queryString}`
          : ""
      );

    let response;

    try {
      response =
        await fetchWithTimeout(
          url,
          {
            method: "GET",
            headers: {
              "Content-Type":
                "application/json",
            },
          }
        );
    } catch (error) {
      if (
        attempt <
        MAX_RETRIES - 1
      ) {
        const delay =
          Math.min(
            2000 *
              Math.pow(
                2,
                attempt
              ),
            15000
          );

        console.warn(
          `[Pionex] market network/timeout ` +
          `on ${path}. Retry in ${delay}ms.`
        );

        await sleep(delay);
        continue;
      }

      throw error;
    }

    if (response.ok) {
      const json =
        await response.json();

      if (cacheTtlMs > 0) {
        setCached(
          key,
          json
        );
      }

      return json;
    }

    const text =
      await response.text();

    if (
      response.status === 429 &&
      attempt <
        MAX_RETRIES - 1
    ) {
      const delay =
        getRetryDelay(
          response,
          attempt
        );

      console.warn(
        `[Pionex] 429 market on ${path}. ` +
        `Retry ${attempt + 1}/${MAX_RETRIES - 1} ` +
        `in ${delay}ms.`
      );

      await sleep(delay);

      continue;
    }

    const error =
      new Error(
        `Pionex market request failed: ` +
        `${response.status} ${text}`
      );

    error.status =
      response.status;

    error.code =
      response.status === 429
        ? "PIONEX_RATE_LIMITED"
        : "PIONEX_MARKET_FAILED";

    throw error;
  }

  throw new Error(
    "Pionex market request failed after retries."
  );
}

export async function getAccountInfo() {
  return request(
    "/api/v1/account/balances",
    {},
    {
      cacheTtlMs: 5000,
    }
  );
}

export async function getWalletBalancesFull() {
  return request(
    "/api/v1/wallet/balancesFull",
    {},
    {
      cacheTtlMs: 5000,
    }
  );
}

export async function getOpenPositions() {
  return request(
    "/uapi/v1/account/positions",
    {},
    {
      cacheTtlMs: 5000,
    }
  );
}

export async function getMarketTickers() {
  return publicRequest(
    "/api/v1/market/tickers",
    {},
    {
      cacheTtlMs: 5000,
    }
  );
}

export async function getMarketSymbols() {
  return publicRequest(
    "/api/v1/common/symbols",
    {},
    {
      cacheTtlMs: 60000,
    }
  );
}

export async function getMarketKlines({
  symbol,
  interval = "1D",
  limit = 100,
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
    },
    {
      cacheTtlMs: 30000,
    }
  );
}

export function clearPionexMarketCache() {
  responseCache.clear();
}
