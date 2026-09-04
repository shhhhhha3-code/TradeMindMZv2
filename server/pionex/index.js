import express from "express";
import { scanPionexMarket } from "./marketScanner.js";

import {
  readPionexAccount,
} from "./pionexAdapter.js";

import {
  getPionexStatus,
} from "./pionexStatus.js";

import { getWalletBalancesFull } from "./pionexClient.js";

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

      res.json(result);
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

