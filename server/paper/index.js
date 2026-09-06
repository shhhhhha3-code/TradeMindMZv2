import express from "express";

import {
  getPaperTrades,
  getPaperStats,
  resetPaperTrades,
} from "./paperTrading.js";

const router =
  express.Router();

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

export default router;
