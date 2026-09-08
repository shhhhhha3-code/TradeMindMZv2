import express from "express";

import {
  getPaperTrades,
  getPaperStats,
  resetPaperTrades,
} from "./paperTrading.js";

import {
  getSignalHistory,
  getSignalStability,
  recordSignal,
  resetSignalHistory,
  evaluateTradeStability,
} from "./signalStability.js";

const router =
  express.Router();

/* -----------------------------------------------------------
   PAPER TRADING
----------------------------------------------------------- */

router.get(
  "/trades",
  (_req, res) => {
    res.json({
      success: true,
      trades:
        getPaperTrades(),
    });
  }
);

router.get(
  "/stats",
  (_req, res) => {
    res.json({
      success: true,
      stats:
        getPaperStats(),
    });
  }
);

router.post(
  "/reset",
  (_req, res) => {
    resetPaperTrades();

    res.json({
      success: true,
      stats:
        getPaperStats(),
    });
  }
);

/* -----------------------------------------------------------
   SIGNAL STABILITY
----------------------------------------------------------- */

router.get(
  "/stability",
  (_req, res) => {
    res.json({
      success: true,
      stability:
        getSignalStability(),
    });
  }
);

router.get(
  "/stability/history",
  (req, res) => {
    const limit =
      Number(
        req.query.limit || 100
      );

    res.json({
      success: true,
      records:
        getSignalHistory(limit),
    });
  }
);

router.post(
  "/stability/record",
  (req, res) => {
    try {
      const signal =
        recordSignal(
          req.body || {}
        );

      res.json({
        success: true,
        signal,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error:
          error?.message ||
          String(error),
      });
    }
  }
);

router.get(
  "/stability/check/:symbol",
  (req, res) => {
    const required =
      Math.max(
        1,
        Number(
          req.query.required || 2
        )
      );

    res.json({
      success: true,
      stability:
        evaluateTradeStability(
          req.params.symbol,
          required
        ),
    });
  }
);

router.post(
  "/stability/reset",
  (_req, res) => {
    resetSignalHistory();

    res.json({
      success: true,
      stability:
        getSignalStability(),
    });
  }
);

export default router;
