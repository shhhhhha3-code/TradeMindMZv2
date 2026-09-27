import { runTradeMindEngine } from "./index.js";

/**
 * TradeMind Engine V2 authoritative pipeline.
 *
 * The caller must provide the full candidate set produced by the market
 * scanner. This function deliberately does not pre-select a scanner TOP 5.
 * TradeMind Engine is the authority for final ranking and decision output.
 *
 * READ-ONLY. No order execution is performed here.
 */
export function runTradeMindEngineV2(markets = [], options = {}) {
  const result = runTradeMindEngine(markets, {
    limit: options.limit ?? 5,
  });

  return {
    ...result,
    engine: "TradeMindMZ Engine V2",
    pipeline: {
      rankingAuthority: "TradeMindMZ Engine",
      inputCandidates: Array.isArray(markets)
        ? markets.length
        : 0,
      finalLimit: options.limit ?? 5,
      scannerPreselection: false,
    },
    safety: {
      readOnly: true,
      automaticTrading: false,
    },
  };
}
