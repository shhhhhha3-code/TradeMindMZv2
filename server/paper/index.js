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

import {
  getLivePaperSnapshot,
  evaluatePaperTradesLive,
} from "./paperEvaluator.js";

import {
  startPaperMonitor,
  stopPaperMonitor,
  getPaperMonitorStatus,
  forcePaperMonitorRun,
} from "./paperMonitor.js";
import { getPaperPerformance } from "./paperPerformance.js";
import { getAdaptiveLearningV4 } from "./adaptiveLearningV4.js";
import { getPaperLearning, syncPaperLearning, resetPaperLearning } from "./paperLearning.js";
import { getPatternIntelligence } from "./patternIntelligence.js";
import { calculateAdaptiveShadowScore, getAdaptiveShadowSummary } from "./adaptiveShadowScore.js";

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

router.get(
  "/live",
  async (_req, res) => {
    try {
      const result =
        await getLivePaperSnapshot();

      res.json(result);
    } catch (error) {
      res.status(502).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

router.post(
  "/evaluate",
  async (_req, res) => {
    try {
      const result =
        await evaluatePaperTradesLive();

      res.json(result);
    } catch (error) {
      res.status(502).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);


/* -----------------------------------------------------------
   PAPER MONITOR
----------------------------------------------------------- */

router.get(
  "/monitor",
  (_req, res) => {
    res.json({
      success: true,
      monitor:
        getPaperMonitorStatus(),
    });
  }
);

router.post(
  "/monitor/start",
  (req, res) => {
    const interval =
      Number(
        req.body?.intervalMs ||
        30_000
      );

    res.json({
      success: true,
      monitor:
        startPaperMonitor(
          interval
        ),
    });
  }
);

router.post(
  "/monitor/stop",
  (_req, res) => {
    res.json({
      success: true,
      monitor:
        stopPaperMonitor(),
    });
  }
);

router.post(
  "/monitor/run",
  async (_req, res) => {
    try {
      const monitor =
        await forcePaperMonitorRun();

      res.json({
        success: true,
        monitor,
      });
    } catch (error) {
      res.status(502).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);


router.get(
  "/performance",
  (req, res) => {
    try {
      const result =
        getPaperPerformance({
          limit:
            Number(
              req.query?.limit || 50
            )
        });

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }
);




router.post(
  "/learning/shadow-score",
  (req, res) => {
    try {
      res.json(
        calculateAdaptiveShadowScore(
          req.body || {}
        )
      );
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }
);

router.get(
  "/learning/shadow-score",
  (_req, res) => {
    try {
      res.json(
        getAdaptiveShadowSummary()
      );
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }
);


router.get(
  "/learning/adaptive-v4",
  async (_req, res) => {
    try {
      res.json(getAdaptiveLearningV4());
    } catch (error) {
      console.error("Adaptive Learning V4 failed:", error);
      res.status(500).json({
        success: false,
        error: error?.message || "Adaptive Learning V4 failed",
      });
    }
  },
);

router.get(
  "/learning/patterns",
  (_req, res) => {
    try {
      res.json(
        getPatternIntelligence()
      );
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }
);

router.get(
  "/learning",
  (req, res) => {
    try {
      const sync =
        syncPaperLearning();

      const result =
        getPaperLearning({
          limit:
            Number(
              req.query?.limit ||
                100
            )
        });

      res.json({
        ...result,
        sync
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }
);

router.post(
  "/learning/sync",
  (_req, res) => {
    try {
      res.json(
        syncPaperLearning()
      );
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }
);

router.post(
  "/learning/reset",
  (_req, res) => {
    try {
      res.json(
        resetPaperLearning()
      );
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
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
