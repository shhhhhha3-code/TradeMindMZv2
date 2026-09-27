import express from "express";
import { getSupabaseClient } from "../supabase/client.js";
import { getAdaptiveStrategyIntelligence } from "./adaptiveStrategyIntelligence.js";
import {
  runCopilot,
  getCopilotLearningStats,
  getCopilotEvidenceSnapshot,
  getCopilotIntelligenceSnapshot,
  reconcileCopilotMemory,
  getCopilotMemoryStats,
} from "./copilotEngine.js";

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

    return res.json(
      await runCopilot({
        markets,
        position,
        preferredProvider,
        candidateLimit,
      }),
    );
  } catch (error) {
    console.error("AI Copilot error:", error);

    return res.status(500).json({
      success: false,
      action: "NO_TRADE",
      error:
        error?.message ||
        "AI Copilot failed.",
      execution: "READ_ONLY",
    });
  }
});

router.get("/evidence", (req, res) => {
  try {
    const limit = Number(
      req.query?.limit || 5000,
    );

    return res.json(
      getCopilotEvidenceSnapshot({
        limit,
      }),
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        String(error),
    });
  }
});

router.get("/intelligence", (req, res) => {
  try {
    const limit = Number(req.query?.limit || 5000);
    return res.json(getCopilotIntelligenceSnapshot({ limit }));
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});


router.get("/strategy", async (req, res) => {
  try {
    const candidate = req.query?.symbol
      ? {
          symbol: req.query.symbol,
          direction: req.query.direction ?? null,
          regime: req.query.regime ?? null,
          risk: req.query.risk ?? null,
          confidence: Number(req.query.confidence ?? 0),
          factorPassCount: Number(req.query.factorPassCount ?? 0),
        }
      : null;
    return res.json(await getAdaptiveStrategyIntelligence(
      getSupabaseClient(),
      candidate,
      Number(req.query?.limit || 5000),
    ));
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || String(error),
      mode: "PAPER_ONLY",
    });
  }
});

router.post("/memory/reconcile", async (_req, res) => {
  try { return res.json(await reconcileCopilotMemory()); }
  catch (error) { return res.status(500).json({ success: false, error: error?.message || String(error) }); }
});

router.get("/memory/stats", async (_req, res) => {
  try { return res.json(await getCopilotMemoryStats()); }
  catch (error) { return res.status(500).json({ success: false, error: error?.message || String(error) }); }
});

router.get("/learning-stats", async (_req, res) => {
  try {
    return res.json(
      await getCopilotLearningStats(),
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      stats: null,
      error:
        error?.message ||
        String(error),
    });
  }
});

export default router;
