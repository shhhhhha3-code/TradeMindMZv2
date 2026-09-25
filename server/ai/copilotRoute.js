import express from "express";
import { runCopilot, getCopilotLearningStats, getCopilotEvidenceSnapshot } from "./copilotEngine.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { markets = [], position = null, preferredProvider = null, candidateLimit = 5 } = req.body || {};
    if (!Array.isArray(markets)) return res.status(400).json({success:false,error:"markets must be an array."});
    return res.json(await runCopilot({markets,position,preferredProvider,candidateLimit}));
  } catch (error) {
    console.error("AI Copilot error:", error);
    return res.status(500).json({success:false,action:"NO_TRADE",error:error?.message||"AI Copilot failed.",execution:"READ_ONLY"});
  }
});

router.get("/evidence", (req, res) => {\n  try {\n    const candidate = req.body?.candidate || null;\n    const limit = Number(req.query?.limit || 5000);\n    return res.json(getCopilotEvidenceSnapshot({ limit, candidate }));\n  } catch (error) {\n    return res.status(500).json({ success: false, error: error?.message || String(error) });\n  }\n});\n\nrouter.get("/learning-stats", async (_req, res) => {
  try { return res.json(await getCopilotLearningStats()); }
  catch (error) { return res.status(500).json({success:false,stats:null,error:error?.message||String(error)}); }
});

export default router;
