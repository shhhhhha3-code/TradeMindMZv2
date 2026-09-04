import {
  getServerAIConfig,
  getAvailableProviders,
} from "./aiConfig.js";

import {
  callAIProvider,
} from "./providers.js";

function number(
  value,
  fallback = null
) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function normalizeDecision(
  value
) {
  const decision =
    String(
      value ?? ""
    )
      .trim()
      .toUpperCase();

  if (
    decision === "TRADE" ||
    decision === "BUY" ||
    decision === "SELL" ||
    decision === "RECOMMENDED"
  ) {
    return "TRADE";
  }

  if (
    decision === "WATCH" ||
    decision === "WAIT"
  ) {
    return "WATCH";
  }

  return "NO_TRADE";
}

function engineHardBlock(
  candidate
) {
  const reasons = [];

  const score =
    number(
      candidate?.engineScore ??
      candidate?.score
    );

  const confidence =
    number(
      candidate?.confidence
    );

  const rr =
    number(
      candidate?.riskReward ??
      candidate?.risk?.riskReward
    );

  const rsi =
    number(
      candidate?.rsi ??
      candidate?.rsi14 ??
      candidate?.indicators?.rsi14
    );

  const volumeRatio =
    number(
      candidate?.volumeRatio ??
      candidate?.indicators?.volumeRatio
    );

  const riskLevel =
    String(
      candidate?.risk?.level ??
      candidate?.riskLevel ??
      ""
    ).toUpperCase();

  if (
    score !== null &&
    score < 75
  ) {
    reasons.push(
      "ENGINE_SCORE_BELOW_MINIMUM"
    );
  }

  if (
    confidence !== null &&
    confidence < 80
  ) {
    reasons.push(
      "CONFIDENCE_BELOW_MINIMUM"
    );
  }

  if (
    rr !== null &&
    rr < 2
  ) {
    reasons.push(
      "RISK_REWARD_BELOW_MINIMUM"
    );
  }

  if (
    rsi !== null &&
    (
      rsi < 35 ||
      rsi > 70
    )
  ) {
    reasons.push(
      "RSI_OUTSIDE_RANGE"
    );
  }

  if (
    volumeRatio !== null &&
    volumeRatio < 0.8
  ) {
    reasons.push(
      "VOLUME_BELOW_MINIMUM"
    );
  }

  if (
    riskLevel === "HIGH"
  ) {
    reasons.push(
      "ENGINE_HIGH_RISK"
    );
  }

  return reasons;
}

function buildSystemPrompt() {
  return `
You are the TradeMindMZ AI Decision Layer.

You are a CROSS-CHECK layer.

A deterministic TradeMindMZ Engine has already evaluated
the market candidates.

You MUST NOT invent market data.

You MUST evaluate ONLY the supplied candidates.

Hard rules:

- Engine score >= 75
- Confidence >= 80
- Risk/reward >= 2
- RSI between 35 and 70
- Volume ratio >= 0.8
- HIGH risk cannot be selected

You MUST NOT override a deterministic engine block.

Your job is to select the strongest eligible candidate,
or return WATCH / NO_TRADE.

Return JSON only:

{
  "decision": "TRADE|WATCH|NO_TRADE",
  "symbol": "SYMBOL",
  "confidence": 0,
  "risk": "LOW|MEDIUM|HIGH",
  "reason": "short explanation"
}
`.trim();
}

function buildUserPrompt(
  candidates
) {
  return `
TradeMindMZ Engine TOP 5:

${JSON.stringify(
  candidates,
  null,
  2
)}
`.trim();
}

function validateAIResult(
  result,
  candidates
) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return {
      valid: false,
      reason:
        "AI returned an invalid result.",
    };
  }

  const symbol =
    String(
      result.symbol ?? ""
    ).toUpperCase();

  const selected =
    candidates.find(
      (candidate) =>
        String(
          candidate.symbol ?? ""
        ).toUpperCase() ===
        symbol
    );

  if (!selected) {
    return {
      valid: false,
      reason:
        "AI selected a symbol outside Engine TOP 5.",
    };
  }

  const hardBlocks =
    engineHardBlock(
      selected
    );

  if (
    hardBlocks.length
  ) {
    return {
      valid: false,
      reason:
        "Selected candidate was blocked by the deterministic engine.",
      hardBlocks,
      selected,
    };
  }

  return {
    valid: true,
    selected,
  };
}

function safeReason(
  value,
  fallback
) {
  const text =
    String(
      value ?? ""
    ).trim();

  return text ||
    fallback;
}

function normalizeAIResult(
  result,
  selected,
  provider
) {
  const decision =
    normalizeDecision(
      result?.decision ??
      result?.verdict
    );

  const confidence =
    number(
      result?.confidence,
      selected?.confidence ?? 0
    );

  const risk =
    String(
      result?.risk ??
      result?.riskLevel ??
      selected?.risk?.level ??
      "MEDIUM"
    ).toUpperCase();

  return {
    decision,

    symbol:
      selected?.symbol ??
      null,

    confidence:
      Math.max(
        0,
        Math.min(
          100,
          confidence ?? 0
        )
      ),

    risk:
      ["LOW", "MEDIUM", "HIGH"].includes(
        risk
      )
        ? risk
        : "MEDIUM",

    reason:
      safeReason(
        result?.reason ??
        result?.reasoning,
        "AI cross-check completed."
      ),

    provider,

    engineScore:
      selected?.engineScore ??
      selected?.score ??
      null,

    engineRisk:
      selected?.risk ??
      null,

    engineCandidate:
      selected,
  };
}

export async function runAIDecisionLayer(
  candidates = [],
  {
    preferredProvider = null,
  } = {}
) {
  const topCandidates =
    Array.isArray(candidates)
      ? candidates.slice(0, 5)
      : [];

  if (
    !topCandidates.length
  ) {
    return {
      success: false,
      decision: "NO_TRADE",
      symbol: null,
      confidence: 0,
      risk: "HIGH",
      reason:
        "No Engine TOP 5 candidates supplied.",
      provider: null,
      blockedByEngine: true,
      engineReasons: [
        "NO_CANDIDATES",
      ],
    };
  }

  /*
   * First safety gate:
   * only candidates that pass every deterministic
   * engine rule are allowed into AI selection.
   */

  const eligible =
    topCandidates.filter(
      (candidate) =>
        engineHardBlock(
          candidate
        ).length === 0
    );

  if (
    !eligible.length
  ) {
    return {
      success: true,
      decision: "NO_TRADE",
      symbol:
        topCandidates[0]?.symbol ??
        null,
      confidence: 0,
      risk: "HIGH",
      reason:
        "No Engine TOP 5 candidate passed all deterministic trade criteria.",
      provider: null,
      blockedByEngine: true,
      engineReasons:
        [
          ...new Set(
            topCandidates.flatMap(
              (candidate) =>
                engineHardBlock(
                  candidate
                )
            )
          ),
        ],
    };
  }

  const config =
    getServerAIConfig();

  const providers =
    getAvailableProviders();

  if (
    !providers.length
  ) {
    return {
      success: false,
      decision: "NO_TRADE",
      symbol:
        eligible[0]?.symbol ??
        null,
      confidence: 0,
      risk: "HIGH",
      reason:
        "No configured AI provider is available.",
      provider: null,
      blockedByEngine: false,
    };
  }

  const orderedProviders = [
    preferredProvider,
    config.defaultProvider,
    ...providers,
  ].filter(
    (provider, index, list) =>
      provider &&
      providers.includes(
        provider
      ) &&
      list.indexOf(
        provider
      ) === index
  );

  const payload = {
    systemPrompt:
      buildSystemPrompt(),

    userPrompt:
      buildUserPrompt(
        topCandidates
      ),
  };

  const errors = [];

  for (
    const provider of orderedProviders
  ) {
    try {
      console.log(
        `[TradeMindMZ AI] Decision layer using ${provider}`
      );

      const result =
        await callAIProvider(
          provider,
          payload
        );

      const validation =
        validateAIResult(
          result,
          eligible
        );

      if (
        !validation.valid
      ) {
        errors.push({
          provider,
          error:
            validation.reason,
        });

        /*
         * The AI response is invalid or unsafe.
         * Try the next configured provider.
         */

        continue;
      }

      const normalized =
        normalizeAIResult(
          result,
          validation.selected,
          provider
        );

      /*
       * Confidence gate.
       *
       * Even if AI says TRADE,
       * confidence < 80 becomes WATCH.
       */

      if (
        normalized.decision ===
          "TRADE" &&
        normalized.confidence < 80
      ) {
        normalized.decision =
          "WATCH";

        normalized.reason =
          `${normalized.reason} AI confidence is below the TradeMindMZ minimum of 80%.`;
      }

      /*
       * Final deterministic safety gate.
       */

      const finalBlocks =
        engineHardBlock(
          validation.selected
        );

      if (
        finalBlocks.length
      ) {
        return {
          success: true,
          decision: "NO_TRADE",
          symbol:
            validation.selected.symbol,
          confidence:
            normalized.confidence,
          risk:
            validation.selected.risk?.level ??
            "HIGH",
          reason:
            "Deterministic Engine blocked the final AI selection.",
          provider,
          blockedByEngine: true,
          engineReasons:
            finalBlocks,
        };
      }

      return {
        success: true,

        decision:
          normalized.decision,

        symbol:
          normalized.symbol,

        confidence:
          normalized.confidence,

        risk:
          normalized.risk,

        reason:
          normalized.reason,

        provider,

        engineScore:
          normalized.engineScore,

        engineRisk:
          normalized.engineRisk,

        engineCandidate:
          normalized.engineCandidate,

        blockedByEngine:
          false,

        providers,

        providerErrors:
          errors,
      };

    } catch (error) {
      errors.push({
        provider,
        error:
          error?.message ??
          String(error),
      });

      console.warn(
        `[TradeMindMZ AI] ${provider} failed:`,
        error?.message ??
        error
      );
    }
  }

  return {
    success: false,

    decision:
      "NO_TRADE",

    symbol:
      eligible[0]?.symbol ??
      null,

    confidence: 0,

    risk: "HIGH",

    reason:
      "All configured AI providers failed during the Decision Layer.",

    provider: null,

    blockedByEngine: false,

    providers,

    providerErrors:
      errors,
  };
}

export {
  engineHardBlock,
};
