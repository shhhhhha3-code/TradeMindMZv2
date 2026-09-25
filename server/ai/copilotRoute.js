import express from "express";
import { runCopilot } from "./copilotEngine.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const {
      markets = [],
      position = null,
      preferredProvider = null,
      candidateLimit = 5,
    } = req.body || {};

    if (!Array.isArray(markets)) {
      return res.status(400).json({
        success: false,
        error: "markets must be an array.",
      });
    }

    const result = await runCopilot({
      markets,
      position,
      preferredProvider,
      candidateLimit,
    });

    return res.json(result);
  } catch (error) {
    console.error("AI Copilot error:", error);

    return res.status(500).json({
      success: false,
      action: "NO_TRADE",
      error: error?.message || "AI Copilot failed.",
      execution: "READ_ONLY",
    });
  }
});

export default router;
