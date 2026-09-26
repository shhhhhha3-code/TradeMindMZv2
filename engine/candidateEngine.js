import { normalizeMarkets } from "./marketDataEngine.js";
import { buildTechnicalSnapshot } from "./technicalEngine.js";
import { scoreMarkets } from "./scoringEngine.js";
import { addRiskAssessment } from "./riskEngine.js";
import { buildMultiTimeframeSnapshot } from "./multiTimeframeEngine.js";

export function buildCandidates(
  inputMarkets = [],
  { limit = 5 } = {}
) {
  const normalized = normalizeMarkets(inputMarkets);

  const enriched = scoreMarkets(
    normalized.map((market) => {
      const technical = buildTechnicalSnapshot(market);
      const multiTimeframe =
        buildMultiTimeframeSnapshot(market);

      return {
        ...market,
        technical,
        multiTimeframe,
        regime: technical.regime,
      };
    })
  ).map(addRiskAssessment);

  return enriched
    .sort((a, b) => b.engineScore - a.engineScore)
    .slice(0, limit)
    .map((market, index) => ({
      rank: index + 1,
      symbol: market.symbol,
      price: market.price,
      entry: market.entry,
      stopLoss: market.stopLoss,
      takeProfit: market.takeProfit,
      direction: market.direction,
      engineScore: market.engineScore,
      confidence: market.confidence,
      trend: market.technical.trend,
      momentum: market.technical.momentum,
      regime: market.regime,
      rsi: market.rsi,
      rsiState: market.technical.rsi.state,
      ema9: market.technical.ema9,
      ema21: market.technical.ema21,
      macd: market.technical.macd,
      atr: market.technical.atr,
      atrPct: market.technical.atrPct,
      riskReward: market.riskReward,
      multiTimeframe: market.multiTimeframe,
      volumeRatio: market.volumeRatio,
      risk: market.risk,
      dataQuality: market.dataQuality,
      source: "TradeMindMZ Engine V3 Foundation",
    }));
}
