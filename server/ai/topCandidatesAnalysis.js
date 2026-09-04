import {
  getServerAIConfig,
  getAvailableProviders,
} from "./aiConfig.js";

import { callAIProvider } from "./providers.js";
import { buildTopCandidatesPrompt } from "./topCandidatesPrompt.js";
import {
  evaluateTradeCandidate,
  getTradeCriteria,
} from "./tradeCriteria.js";

function normalizeResult(result = {}) {
  const recommended =
    result?.recommended || {};

  return {
    verdict:
      ["RECOMMENDED", "WATCH", "NO_TRADE"].includes(
        result?.verdict
      )
        ? result.verdict
        : "NO_TRADE",

    recommended: {
      symbol:
        recommended.symbol || null,

      direction:
        recommended.direction || "NEUTRAL",

      score: Math.max(
        0,
        Math.min(
          100,
          Number(recommended.score) || 0
        )
      ),

      confidence: Math.max(
        0,
        Math.min(
          100,
          Number(recommended.confidence) || 0
        )
      ),

      entry:
        Number.isFinite(Number(recommended.entry))
          ? Number(recommended.entry)
          : null,

      stopLoss:
        Number.isFinite(
          Number(recommended.stopLoss)
        )
          ? Number(recommended.stopLoss)
          : null,

      takeProfit:
        Number.isFinite(
          Number(recommended.takeProfit)
        )
          ? Number(recommended.takeProfit)
          : null,

      riskReward:
        Number.isFinite(
          Number(recommended.riskReward)
        )
          ? Number(recommended.riskReward)
          : null,

      riskLevel:
        ["LOW", "MEDIUM", "HIGH"].includes(
          recommended.riskLevel
        )
          ? recommended.riskLevel
          : "MEDIUM",

      reasoning:
        recommended.reasoning || "",
    },

    alternatives:
      Array.isArray(result?.alternatives)
        ? result.alternatives
        : [],

    comparison:
      Array.isArray(result?.comparison)
        ? result.comparison
        : [],

    summary:
      result?.summary || "",
  };
}

export async function analyzeTopCandidates({
  candidates = [],
  preferredProvider,
} = {}) {
  const providers =
    getAvailableProviders();

  if (!providers.length) {
    return {
      success: false,
      status: "NO_PROVIDER",
      provider: null,
      providers: [],
      recommendation: null,
      error:
        "No AI provider is configured.",
    };
  }

  if (
    !Array.isArray(candidates) ||
    candidates.length === 0
  ) {
    return {
      success: false,
      status: "NO_CANDIDATES",
      provider: null,
      providers,
      recommendation: null,
      error:
        "No scanner candidates were supplied.",
    };
  }

  const config =
    getServerAIConfig();

  const prompt =
    buildTopCandidatesPrompt({
      candidates: candidates.slice(0, 5),
    });

  const orderedProviders = [
    preferredProvider,
    config.defaultProvider,
    ...providers,
  ].filter(
    (provider, index, list) =>
      provider &&
      providers.includes(provider) &&
      list.indexOf(provider) === index
  );

  const errors = [];

  for (const provider of orderedProviders) {
    try {
      const result =
        await callAIProvider(
          provider,
          prompt
        );

      const normalized =
        normalizeResult(result);

      const candidatesForEvaluation =
        candidates.slice(0, 5);

      const sortedCandidates =
        [...candidatesForEvaluation]
          .sort(
            (a, b) =>
              Number(b?.score || 0) -
              Number(a?.score || 0)
          );

      const bestCandidate =
        sortedCandidates[0] || null;

      const requestedCandidate =
        normalized?.recommended?.symbol
          ? candidatesForEvaluation.find(
              candidate =>
                candidate?.symbol ===
                normalized.recommended.symbol
            )
          : null;

      const candidateToEvaluate =
        requestedCandidate || bestCandidate;

      const evaluation =
        evaluateTradeCandidate({
          ...(candidateToEvaluate || {}),
          ...(requestedCandidate
            ? normalized.recommended
            : {}),
          rsi:
            candidateToEvaluate?.rsi ??
            candidateToEvaluate?.rsi14 ??
            candidateToEvaluate?.indicators?.rsi14,
          volumeRatio:
            candidateToEvaluate?.volumeRatio ??
            candidateToEvaluate?.indicators?.volumeRatio,
          riskReward:
            requestedCandidate
              ? normalized.recommended?.riskReward ??
                candidateToEvaluate?.riskReward
              : candidateToEvaluate?.riskReward,
          entry:
            requestedCandidate
              ? normalized.recommended?.entry ??
                candidateToEvaluate?.entry
              : candidateToEvaluate?.entry,
          stopLoss:
            requestedCandidate
              ? normalized.recommended?.stopLoss ??
                candidateToEvaluate?.stopLoss
              : candidateToEvaluate?.stopLoss,
          takeProfit:
            requestedCandidate
              ? normalized.recommended?.takeProfit ??
                candidateToEvaluate?.takeProfit
              : candidateToEvaluate?.takeProfit,
          direction:
            requestedCandidate
              ? normalized.recommended?.direction ??
                candidateToEvaluate?.direction
              : candidateToEvaluate?.direction,
          confidence:
            requestedCandidate
              ? normalized.recommended?.confidence ??
                candidateToEvaluate?.confidence
              : candidateToEvaluate?.confidence,
          score:
            requestedCandidate
              ? normalized.recommended?.score ??
                candidateToEvaluate?.score
              : candidateToEvaluate?.score,
          riskLevel:
            requestedCandidate
              ? normalized.recommended?.riskLevel ??
                candidateToEvaluate?.riskLevel
              : candidateToEvaluate?.riskLevel,
        });

      const aiRecommended =
        normalized.verdict === "RECOMMENDED";

      const tradeAllowed =
        aiRecommended &&
        Boolean(normalized.recommended?.symbol) &&
        evaluation.passed;

      const bestCandidateSummary =
        bestCandidate
          ? {
              symbol: bestCandidate.symbol,
              direction: bestCandidate.direction,
              score: bestCandidate.score,
              confidence: bestCandidate.confidence,
              entry: bestCandidate.entry,
              stopLoss: bestCandidate.stopLoss,
              takeProfit: bestCandidate.takeProfit,
              riskReward: bestCandidate.riskReward,
              riskLevel: bestCandidate.riskLevel,
              rsi:
                bestCandidate.rsi ??
                bestCandidate.rsi14 ??
                bestCandidate.indicators?.rsi14 ??
                null,
              volumeRatio:
                bestCandidate.volumeRatio ??
                bestCandidate.indicators?.volumeRatio ??
                null,
            }
          : null;

      if (!tradeAllowed) {
        const noTradeReason =
          aiRecommended &&
          evaluation.failedChecks.length
            ? `AI selected ${
                normalized.recommended?.symbol ||
                bestCandidate?.symbol ||
                "a candidate"
              }, but the explicit TradeMindMZ criteria rejected the setup: ${
                evaluation.failedChecks
                  .map(check => check.label)
                  .join(", ")
              }.`
            : normalized.verdict === "NO_TRADE"
              ? (
                  normalized.summary ||
                  "No candidate met the required trade criteria."
                )
              : (
                  normalized.summary ||
                  "No candidate met the required trade criteria."
                );

        return {
          success: true,
          status: "AI_TOP5_ANALYZED",
          provider,
          providers,
          recommendation: {
            ...normalized,
            verdict: "NO_TRADE",
            recommended: {
              ...bestCandidateSummary,
              symbol:
                bestCandidate?.symbol || null,
              direction:
                bestCandidate?.direction || "NEUTRAL",
              score:
                Number(bestCandidate?.score) || 0,
              confidence:
                Number(bestCandidate?.confidence) || 0,
              entry:
                Number.isFinite(
                  Number(bestCandidate?.entry)
                )
                  ? Number(bestCandidate.entry)
                  : null,
              stopLoss:
                Number.isFinite(
                  Number(bestCandidate?.stopLoss)
                )
                  ? Number(bestCandidate.stopLoss)
                  : null,
              takeProfit:
                Number.isFinite(
                  Number(bestCandidate?.takeProfit)
                )
                  ? Number(bestCandidate.takeProfit)
                  : null,
              riskReward:
                Number.isFinite(
                  Number(bestCandidate?.riskReward)
                )
                  ? Number(bestCandidate.riskReward)
                  : null,
              riskLevel:
                bestCandidate?.riskLevel ||
                "MEDIUM",
              reasoning:
                noTradeReason,
            },
          },
          criteria: {
            passed: evaluation.passed,
            checks: evaluation.checks,
            failedChecks:
              evaluation.failedChecks,
            evaluatedCandidate:
              candidateToEvaluate?.symbol || null,
            bestCandidate:
              bestCandidateSummary,
          },
          error: null,
        };
      }

      return {
        success: true,
        status: "AI_TOP5_ANALYZED",
        provider,
        providers,
        recommendation: normalized,
        criteria: {
          passed: evaluation.passed,
          checks: evaluation.checks,
          failedChecks:
            evaluation.failedChecks,
          evaluatedCandidate:
            candidateToEvaluate?.symbol || null,
          bestCandidate:
            bestCandidateSummary,
        },
        error: null,
      };
    } catch (error) {
      errors.push({
        provider,
        message:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  return {
    success: false,
    status: "AI_FAILED",
    provider: null,
    providers,
    recommendation: null,
    error:
      "All configured AI providers failed.",
    providerErrors: errors,
  };
}
