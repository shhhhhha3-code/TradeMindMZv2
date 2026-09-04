import express from "express";
import { scanPionexMarket } from "./marketScanner.js";

import {
  readPionexAccount,
} from "./pionexAdapter.js";

import {
  getPionexStatus,
} from "./pionexStatus.js";

import { getWalletBalancesFull } from "./pionexClient.js";

import {
  runAIDecisionLayer,
} from "../ai/aiDecisionEngine.js";

const router =
  express.Router();

/**
 * PIONEX READ-ONLY ROUTES
 *
 * There are intentionally no:
 *
 * Order endpoints intentionally absent.
 * create order
 * cancel order
 * amend order
 *
 * routes.
 */

router.get(
  "/status",
  (_req, res) => {
    res.json({
      success: true,
      ...getPionexStatus(),
    });
  }
);

router.get(
  "/account",
  async (_req, res) => {
    try {
      const account =
        await readPionexAccount();

      res.json({
        success: true,
        ...account,
      });

    } catch (error) {
      res.status(502).json({
        success: false,

        connected: false,

        error:
          error instanceof Error
            ? error.message
            : "Pionex request failed.",
      });
    }
  }
);

router.get(
  "/positions",
  async (_req, res) => {
    try {
      const result =
        await readPionexAccount();

      res.json({
        success: true,

        connected:
          result.connected,

        positions:
          result.positions,

        errors:
          result.errors,

        updatedAt:
          result.updatedAt,
      });

    } catch (error) {
      res.status(502).json({
        success: false,

        positions: [],

        error:
          error instanceof Error
            ? error.message
            : "Pionex request failed.",
      });
    }
  }
);


router.get(
  "/wallet-balances",
  async (_req, res) => {
    try {
      const wallet =
        await getWalletBalancesFull();

      if (!wallet?.result) {
        return res.status(502).json({
          success: false,
          source: "pionex",
          error:
            wallet?.message ||
            "Pionex wallet request failed.",
          code:
            wallet?.code ||
            "PIONEX_WALLET_ERROR",
          data:
            wallet || null,
        });
      }

      return res.json({
        success: true,
        source: "pionex",
        data:
          wallet.data,
        updatedAt:
          new Date().toISOString(),
      });

    } catch (error) {
      return res.status(502).json({
        success: false,
        source: "pionex",
        data: null,
        error:
          error instanceof Error
            ? error.message
            : "Pionex wallet request failed.",
      });
    }
  }
);

router.get(
  "/market-scan",
  async (req, res) => {
    try {
      const result =
        await scanPionexMarket({
          interval:
            req.query.interval || "1D",
          candleLimit:
            Number(req.query.limit || 100),
          maxMarkets:
            Number(req.query.maxMarkets || 25),
        });

      /*
       * TradeMindMZ decision pipeline:
       *
       * Pionex
       * → local scanner
       * → Engine V1
       * → Engine TOP 5
       * → AI Decision Layer
       * → final decision
       *
       * READ-ONLY.
       * No order execution.
       */

      let aiDecision = null;

      if (
        Array.isArray(
          result?.engineTop5
        ) &&
        result.engineTop5.length
      ) {
        try {
          aiDecision =
            await runAIDecisionLayer(
              result.engineTop5,
              {
                preferredProvider:
                  req.query.provider ||
                  process.env.AI_DEFAULT_PROVIDER ||
                  "groq",
              }
            );
        } catch (aiError) {
          console.error(
            "TradeMindMZ AI decision layer failed:",
            aiError
          );

          aiDecision = {
            success: false,

            decision:
              "NO_TRADE",

            symbol:
              result.engineRecommendation?.symbol ??
              result.engineTop5?.[0]?.symbol ??
              null,

            confidence: 0,

            risk: "HIGH",

            reason:
              aiError instanceof Error
                ? aiError.message
                : "AI decision layer failed.",

            provider: null,

            blockedByEngine: false,

            error: true,
          };
        }
      } else {
        aiDecision = {
          success: false,

          decision:
            "NO_TRADE",

          symbol: null,

          confidence: 0,

          risk: "HIGH",

          reason:
            "Engine TOP 5 unavailable.",

          provider: null,

          blockedByEngine: true,
        };
      }

      /*
       * Final decision rule:
       *
       * Engine must have valid candidate data.
       * AI cannot override deterministic Engine blocks.
       */

      const finalDecision =
        aiDecision?.success === true
          ? aiDecision.decision
          : "NO_TRADE";

      res.json({
        ...result,

        aiDecision,

        finalDecision,

        decisionPipeline: {
          marketSource: "PIONEX",

          engine:
            "TradeMindMZ Engine V1",

          ai:
            "TradeMindMZ AI Decision Layer V1",

          automaticTrading:
            false,

          readOnly:
            true,
        },
      });
    } catch (error) {
      console.error(
        "Pionex market scan failed:",
        error
      );

      res.status(502).json({
        success: false,
        scanned: 0,
        candidates: [],
        error:
          error instanceof Error
            ? error.message
            : "Pionex market scan failed.",
      });
    }
  }
);

export default router;

