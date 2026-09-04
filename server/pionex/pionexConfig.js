/**
 * TradeMindMZ V2 — Pionex configuration
 *
 * READ-ONLY ONLY.
 *
 * API credentials remain server-side.
 *
 * No order endpoints are implemented here.
 */

export function getPionexConfig() {
  return {
    apiKey: process.env.PIONEX_API_KEY || "",
    apiSecret: process.env.PIONEX_API_SECRET || "",
    baseUrl:
      process.env.PIONEX_BASE_URL ||
      "https://api.pionex.com",
  };
}

export function isPionexConfigured() {
  const config = getPionexConfig();

  return Boolean(
    config.apiKey &&
    config.apiSecret
  );
}
