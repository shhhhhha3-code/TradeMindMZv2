import { callAIProvider } from "./providers.js";
import {
  savePositionAIAnalysis
} from "./positionAIHistory.js";

function buildPositionPrompt(
  position,
  market = {}
) {
  return {
    systemPrompt: `
You are TradeMindMZ position risk analyst.

Analyze ONLY the supplied Pionex position
and supplied market data.

You do NOT place trades.
You do NOT modify orders.
You do NOT access Pionex directly.
You must not invent missing information.

Your task is to assess current risk.

Return ONLY valid JSON:

{
  "recommendation": "HOLD|WATCH|REDUCE_RISK|EXIT_CONSIDERATION",
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "confidence": 0,
  "reasoning": "brief explanation",
  "action": "brief practical guidance"
}

Rules:
- HOLD = position remains reasonable.
- WATCH = position can remain open but needs attention.
- REDUCE_RISK = risk increased materially.
- EXIT_CONSIDERATION = conditions significantly unfavorable.
- Confidence must be 0-100 integer.
- Use ONLY supplied data.
- Never invent indicators.
- Never invent news.
- Never invent targets.
- Never claim certainty.
`,

    userPrompt: `
OPEN POSITION:

${JSON.stringify(
  position,
  null,
  2
)}

CURRENT MARKET DATA:

${JSON.stringify(
  market,
  null,
  2
)}

Analyze only the supplied data.
`
  };
}

function normalize(result) {
  const recommendations = [
    "HOLD",
    "WATCH",
    "REDUCE_RISK",
    "EXIT_CONSIDERATION"
  ];

  const risks = [
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL"
  ];

  const recommendation =
    String(
      result?.recommendation ||
      "WATCH"
    ).toUpperCase();

  const riskLevel =
    String(
      result?.riskLevel ||
      "MEDIUM"
    ).toUpperCase();

  const confidence =
    Number(
      result?.confidence
    );

  return {
    recommendation:
      recommendations.includes(
        recommendation
      )
        ? recommendation
        : "WATCH",

    riskLevel:
      risks.includes(
        riskLevel
      )
        ? riskLevel
        : "MEDIUM",

    confidence:
      Number.isFinite(
        confidence
      )
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round(
                confidence
              )
            )
          )
        : 0,

    reasoning:
      String(
        result?.reasoning ||
        "AI did not provide reasoning."
      ),

    action:
      String(
        result?.action ||
        "Continue monitoring."
      )
  };
}

export async function analyzeLivePosition({
  position,
  market = {},
  preferredProvider = "groq"
}) {

  if (!position) {
    throw new Error(
      "Position is required."
    );
  }

  if (!position.symbol) {
    throw new Error(
      "Position symbol is required."
    );
  }

  /*
   * Snapshot the fields before AI processing.
   * This guarantees history receives the same
   * identity metadata that entered the analysis.
   */
  const historyPosition = {
    ...position,

    symbol:
      String(
        position.symbol
      ).trim(),

    direction:
      position.direction
        ? String(
            position.direction
          ).trim().toUpperCase()
        : (
            String(
              position.side || ""
            ).trim().toUpperCase() ===
            "LONG"
              ? "BUY"
              : String(
                  position.side || ""
                ).trim().toUpperCase() ===
                "SHORT"
                ? "SELL"
                : null
          ),

    entryPrice:
      position.entryPrice ??
      position.entry_price ??
      null,

    currentPrice:
      position.currentPrice ??
      position.markPrice ??
      position.lastPrice ??
      null,

    source:
      position.source ||
      "PIONEX"
  };

  console.log(
    "Position AI received:",
    {
      symbol:
        historyPosition.symbol,

      direction:
        historyPosition.direction,

      entryPrice:
        historyPosition.entryPrice,

      currentPrice:
        historyPosition.currentPrice,

      source:
        historyPosition.source
    }
  );

  const payload =
    buildPositionPrompt(
      historyPosition,
      market
    );

  const provider =
    "groq";

  const response =
    await callAIProvider(
      provider,
      payload
    );

  const analysis =
    normalize(
      response
    );

  let history =
    null;

  try {

    history =
      await savePositionAIAnalysis({
        position:
          historyPosition,

        analysis,

        provider
      });

  } catch (historyError) {

    console.error(
      "Position AI history save failed:",
      historyError
    );

  }

  return {
    success: true,

    status:
      "POSITION_AI_ANALYZED",

    provider,

    analysis,

    historySaved:
      Boolean(history),

    historyId:
      history?.id ||
      null,

    historyMetadata:
      history
        ? {
            symbol:
              history.symbol,

            direction:
              history.direction,

            entryPrice:
              history.entry_price,

            source:
              history.source
          }
        : null,

    error:
      null
  };
}
