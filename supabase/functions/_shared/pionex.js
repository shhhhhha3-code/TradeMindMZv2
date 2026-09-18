const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 4;
const MIN_REQUEST_GAP_MS = 350;

let lastRequestAt = 0;
const responseCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cacheKey(path, query) {
  return `${path}?${new URLSearchParams(query).toString()}`;
}

function getCached(key, ttlMs) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  responseCache.set(key, { timestamp: Date.now(), value });
}

async function respectRequestGap() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await sleep(MIN_REQUEST_GAP_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

function retryDelay(response, attempt) {
  const retryAfter = response?.headers?.get("retry-after");
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 1500), 30000);
  return Math.min(2000 * Math.pow(2, attempt), 30000);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function config() {
  return {
    apiKey: Deno.env.get("PIONEX_API_KEY") || "",
    apiSecret: Deno.env.get("PIONEX_API_SECRET") || "",
    baseUrl: Deno.env.get("PIONEX_BASE_URL") || "https://api.pionex.com",
  };
}

function buildQuery(query = {}) {
  const params = new URLSearchParams({ ...query, timestamp: Date.now().toString() });
  return [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

async function privateRequest(path, query = {}, { cacheTtlMs = 0 } = {}) {
  const cfg = config();
  if (!cfg.apiKey || !cfg.apiSecret) throw new Error("Pionex API credentials are not configured.");

  const key = cacheKey(path, query);
  if (cacheTtlMs > 0) {
    const cached = getCached(key, cacheTtlMs);
    if (cached !== null) return cached;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    await respectRequestGap();
    const queryString = buildQuery(query);
    const signature = await hmacHex(cfg.apiSecret, `GET${path}?${queryString}`);
    const url = `${cfg.baseUrl}${path}?${queryString}`;
    let response;
    try {
      response = await fetchWithTimeout(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "PIONEX-KEY": cfg.apiKey,
          "PIONEX-SIGNATURE": signature,
        },
      });
    } catch (error) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(Math.min(2000 * Math.pow(2, attempt), 15000));
        continue;
      }
      throw error;
    }

    const text = await response.text();
    if (response.ok) {
      let json;
      try { json = JSON.parse(text); } catch { throw new Error(`Pionex returned invalid JSON: ${text.slice(0, 200)}`); }
      if (cacheTtlMs > 0) setCached(key, json);
      return json;
    }

    if (response.status === 429 && attempt < MAX_RETRIES - 1) {
      await sleep(retryDelay(response, attempt));
      continue;
    }

    const error = new Error(`Pionex request failed: ${response.status} ${text}`);
    error.status = response.status;
    error.code = response.status === 429 ? "PIONEX_RATE_LIMITED" : "PIONEX_REQUEST_FAILED";
    throw error;
  }
  throw new Error("Pionex request failed after retries.");
}

async function publicRequest(path, query = {}, { cacheTtlMs = 0 } = {}) {
  const cfg = config();
  const key = cacheKey(path, query);
  if (cacheTtlMs > 0) {
    const cached = getCached(key, cacheTtlMs);
    if (cached !== null) return cached;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    await respectRequestGap();
    const queryString = new URLSearchParams(query).toString();
    const url = `${cfg.baseUrl}${path}${queryString ? `?${queryString}` : ""}`;
    let response;
    try {
      response = await fetchWithTimeout(url, {
        method: "GET",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      });
    } catch (error) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(Math.min(2000 * Math.pow(2, attempt), 15000));
        continue;
      }
      throw error;
    }

    const text = await response.text();
    if (response.ok) {
      let json;
      try { json = JSON.parse(text); } catch { throw new Error(`Pionex market returned invalid JSON: ${text.slice(0, 200)}`); }
      if (cacheTtlMs > 0) setCached(key, json);
      return json;
    }

    if (response.status === 429 && attempt < MAX_RETRIES - 1) {
      await sleep(retryDelay(response, attempt));
      continue;
    }

    const error = new Error(`Pionex market request failed: ${response.status} ${text}`);
    error.status = response.status;
    error.code = response.status === 429 ? "PIONEX_RATE_LIMITED" : "PIONEX_MARKET_FAILED";
    throw error;
  }
  throw new Error("Pionex market request failed after retries.");
}

export const getAccountInfo = () => privateRequest("/api/v1/account/balances", {}, { cacheTtlMs: 5000 });
export const getWalletBalancesFull = () => privateRequest("/api/v1/wallet/balancesFull", {}, { cacheTtlMs: 5000 });
export const getOpenPositions = () => privateRequest("/uapi/v1/account/positions", {}, { cacheTtlMs: 5000 });
export const getMarketTickers = () => publicRequest("/api/v1/market/tickers", {}, { cacheTtlMs: 5000 });
export const getMarketSymbols = () => publicRequest("/api/v1/common/symbols", {}, { cacheTtlMs: 60000 });
export function getMarketKlines({ symbol, interval = "1D", limit = 100 } = {}) {
  if (!symbol) throw new Error("Symbol is required for market klines.");
  return publicRequest("/api/v1/market/klines", { symbol, interval, limit: String(limit) }, { cacheTtlMs: 30000 });
}
