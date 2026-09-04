import {
  normalizeMarkets,
} from "./marketDataEngine.js";

import {
  buildTechnicalSnapshot,
} from "./technicalEngine.js";

import {
  scoreMarkets,
} from "./scoringEngine.js";

import {
  addRiskAssessment,
} from "./riskEngine.js";

export function buildCandidates(
  inputMarkets = [],
  {
    limit = 5,
  } = {}
) {
  const normalized =
    normalizeMarkets(
      inputMarkets
    );

  const enriched =
    scoreMarkets(
      normalized
    )
      .map((market) => ({
        ...market,

        technical:
          buildTechnicalSnapshot(
            market
          ),
      }))
      .map(
        addRiskAssessment
      );

  return enriched
    .sort(
      (a, b) =>
        b.engineScore -
        a.engineScore
    )
    .slice(0, limit)
    .map((market, index) => ({
      rank: index + 1,

      symbol:
        market.symbol,

      engineScore:
        market.engineScore,

      confidence:
        market.confidence,

      trend:
        market.technical.trend,

      momentum:
        market.technical.momentum,

      rsi:
        market.rsi,

      rsiState:
        market.technical.rsi.state,

      riskReward:
        market.riskReward,

      volumeRatio:
        market.volumeRatio,

      risk:
        market.risk,

      source:
        "TradeMindMZ Engine V1",
    }));
}
