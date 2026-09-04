import express from "express";
import {
  analyzePositionWithAI,
} from "./positionAI.js";

const router = express.Router();

/*
 * AI analysis of an already-open position.
 *
 * IMPORTANT:
 * - No BUY
 * - No SELL
 * - No CLOSE
 * - No CANCEL
 * - No Pionex order execution
 */

router.post("/", async (req, res) => {
  try {
    const position = req.body?.position;

    if (!position) {
      return res.status(400).json({
        success: false,
        error: "Position data is required.",
      });
    }

    const result = await analyzePositionWithAI(
      position,
      req.body?.marketData || {},
      req.body?.historicalData || []
    );

    return res.json({
      success: true,
      result,
    });

  } catch (error) {
    console.error(
      "Position AI error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Position AI analysis failed.",
    });
  }
});

export default router;
