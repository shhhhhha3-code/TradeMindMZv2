import {
  buildCandidates,
} from "./candidateEngine.js";

import {
  evaluateCandidates,
} from "./decisionEngine.js";

export function runTradeMindEngine(
  markets = [],
  options = {}
) {
  const candidates =
    buildCandidates(
      markets,
      {
        limit:
          options.limit ?? 5,
      }
    );

  const result =
    evaluateCandidates(
      candidates
    );

  return {
    engine: "TradeMindMZ Engine V1",

    timestamp:
      Date.now(),

    scanned:
      Array.isArray(markets)
        ? markets.length
        : 0,

    top5:
      result.candidates,

    decision:
      result.decision,

    recommendation:
      result.recommendation,

    safety: {
      readOnly: true,

      automaticTrading:
        false,
    },
  };
}

export * from "./marketDataEngine.js";
export * from "./technicalEngine.js";
export * from "./scoringEngine.js";
export * from "./riskEngine.js";
export * from "./candidateEngine.js";
export * from "./decisionEngine.js";
