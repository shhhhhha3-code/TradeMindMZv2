import "dotenv/config";
import { analyzeLivePosition } from "./ai/livePositionAnalysis.js";
import { getLearningStats } from "./ai/learningStats.js";
import { getSignalHistory } from "./ai/signalHistory.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { analyzeServerAI } from "./ai/serverAIAnalysis.js";
import pionexRouter from "./pionex/index.js";
import positionRoute from "./ai/positionRoute.js";

import supabaseRouter from "./supabase/route.js";
import positionsRouter from "./positions/route.js";
import { analyzeTopCandidates } from "./ai/topCandidatesAnalysis.js";
import { getTradeCriteria, saveTradeCriteria } from "./ai/tradeCriteria.js";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 3001);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

/*
 * Basic health endpoint.
 *
 * This does not expose secrets.
 */
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    service: "TradeMindMZ V2",
    status: "ONLINE",
    ai: true,
    pionex: "READ_ONLY",
    trading: false,
  });
});

/*
 * AI market analysis.
 *
 * AI may analyze market information.
 * No trading operation is performed here.
 */
app.post("/api/ai/analyze", async (req, res) => {
  try {
    const result = await analyzeServerAI(req.body || {});

    res.json(result);
  } catch (error) {
    console.error("AI analysis error:", error);

    res.status(500).json({
      success: false,
      error: error?.message || "AI analysis failed.",
    });
  }
});


/*
 * AI TOP 5 EXPERT ANALYSIS.
 *
 * Receives local scanner candidates and returns
 * one best recommendation or NO_TRADE.
 */



app.get("/api/ai/signal-history", async (req, res) => {
  try {
    const result =
      await getSignalHistory(
        req.query?.limit
      );

    return res.json(result);
  } catch (error) {
    console.error(
      "Signal history failed:",
      error
    );

    return res.status(500).json({
      success: false,
      history: [],
      count: 0,
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
});

app.get("/api/ai/learning-stats", async (req, res) => {
  try {
    const stats =
      await getLearningStats();

    return res.json(stats);
  } catch (error) {
    console.error(
      "Learning stats failed:",
      error
    );

    return res.status(500).json({
      success: false,
      totalAnalyses: 0,
      averageConfidence: 0,
      recommendations: {},
      providers: {},
      latest: null,
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
});

app.post(
  "/api/ai/position-analyze",
  async (req, res) => {
    try {
      const {
        position,
        market = {},
        preferredProvider = "groq"
      } = req.body || {};

      if (!position) {
        return res.status(400).json({
          success: false,
          error: "Position is required."
        });
      }

      const {
        analyzeLivePosition
      } = await import(
        "./ai/livePositionAnalysis.js"
      );

      const result =
        await analyzeLivePosition({
          position,
          market,
          preferredProvider
        });

      return res.json({
        success: true,

        status:
          "POSITION_AI_ANALYZED",

        provider:
          result?.provider || preferredProvider,

        analysis:
          result?.analysis || null,

        historySaved:
          result?.historySaved === true,

        historyId:
          result?.historyId || null,

        error:
          result?.error || null
      });

    } catch (error) {

      console.error(
        "Position AI endpoint error:",
        error
      );

      return res.status(500).json({
        success: false,

        status:
          "POSITION_AI_ERROR",

        error:
          error?.message ||
          "Position AI analysis failed"
      });
    }
  }
);


app.post("/api/ai/top-candidates", async (req, res) => {
  try {
    const result = await analyzeTopCandidates({
      candidates: req.body?.candidates || [],
      preferredProvider: req.body?.preferredProvider,
    });

    res.json(result);
  } catch (error) {
    console.error("AI TOP 5 analysis error:", error);

    res.status(500).json({
      success: false,
      status: "AI_FAILED",
      recommendation: null,
      error:
        error?.message ||
        "AI TOP 5 analysis failed.",
    });
  }
});

/*
 * AI position analysis.
 *
 * Analyses an already-open position only.
 */
app.use("/api/supabase", supabaseRouter);
app.use("/api/positions", positionsRouter);
app.use("/api/ai/position", positionRoute);

/*
 * Pionex routes are READ ONLY.
 *
 * No BUY.
 * No SELL.
 * No CANCEL.
 */
app.use("/api/pionex", pionexRouter);



app.get("/api/diagnostics", async (_req, res) => {
  const startedAt = Date.now();

  const runCheck = async (name, fn) => {
    const started = Date.now();

    try {
      const result = await fn();

      return {
        name,
        status: "OK",
        httpStatus: result?.httpStatus ?? 200,
        durationMs: Date.now() - started,
        details: result?.details ?? null,
        error: null,
      };
    } catch (error) {
      return {
        name,
        status: "ERROR",
        httpStatus: error?.status || 500,
        durationMs: Date.now() - started,
        details: null,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  };

  const fetchJson = async (url) => {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const text = await response.text();

    let body = null;

    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!response.ok) {
      const error = new Error(
        body?.error ||
        body?.message ||
        `HTTP ${response.status}`
      );

      error.status = response.status;
      throw error;
    }

    return {
      httpStatus: response.status,
      body,
    };
  };

  const baseUrl =
    `http://127.0.0.1:${process.env.PORT || 3001}`;

  const checks = [];

  checks.push(
    await runCheck(
      "Backend",
      async () => {
        const result =
          await fetchJson(`${baseUrl}/api/health`);

        return {
          httpStatus: result.httpStatus,
          details: {
            service: "Express backend",
          },
        };
      }
    )
  );

  checks.push(
    await runCheck(
      "Supabase",
      async () => {
        const result =
          await fetchJson(
            `${baseUrl}/api/ai/learning-stats`
          );

        return {
          httpStatus: result.httpStatus,
          details: {
            totalAnalyses:
              result.body?.totalAnalyses ??
              result.body?.data?.totalAnalyses ??
              0,
            provider:
              result.body?.providers
                ? Object.keys(
                    result.body.providers
                  )[0] || "—"
                : "—",
          },
        };
      }
    )
  );

  checks.push(
    await runCheck(
      "Pionex",
      async () => {
        const result =
          await fetchJson(
            `${baseUrl}/api/pionex/live-positions`
          );

        return {
          httpStatus: result.httpStatus,
          details: {
            source:
              result.body?.source || "PIONEX",
            openPositions:
              result.body?.count ?? 0,
          },
        };
      }
    )
  );

  checks.push(
    await runCheck(
      "Market API",
      async () => {
        const result =
          await fetchJson(
            `${baseUrl}/api/pionex/market-scan?scanLimit=10&maxMarkets=5`
          );

        return {
          httpStatus: result.httpStatus,
          details: {
            scanned:
              result.body?.scanned ??
              result.body?.count ??
              0,
            candidates:
              Array.isArray(result.body?.candidates)
                ? result.body.candidates.length
                : 0,
          },
        };
      }
    )
  );

  const groqConfigured =
    Boolean(process.env.GROQ_API_KEY);

  let latestProvider = "—";
  let learningStatus = null;

  try {
    const result =
      await fetchJson(
        `${baseUrl}/api/ai/learning-stats`
      );

    learningStatus =
      result.body || null;

    if (
      learningStatus?.providers &&
      Object.keys(learningStatus.providers).length
    ) {
      latestProvider =
        Object.keys(
          learningStatus.providers
        )[0];
    }
  } catch {
    // Already captured by Supabase check.
  }

  checks.push({
    name: "Groq AI",
    status: groqConfigured
      ? "CONFIGURED"
      : "ERROR",
    httpStatus: groqConfigured ? 200 : 500,
    durationMs: null,
    details: {
      configured: groqConfigured,
      activeProvider:
        process.env.AI_DEFAULT_PROVIDER ||
        latestProvider ||
        "—",
      probe: false,
      note:
        groqConfigured
          ? "Groq is configured. No live probe is performed to avoid unnecessary API usage."
          : "GROQ_API_KEY is not configured.",
      totalAnalyses:
        learningStatus?.totalAnalyses ?? null,
    },
    error: groqConfigured
      ? null
      : "GROQ_API_KEY is not configured.",
  });

  const overallOk =
    checks.every(
      check =>
        check.status === "OK" ||
        check.status === "CONFIGURED"
    );

  const totalDurationMs =
    Date.now() - startedAt;

  res.json({
    success: overallOk,
    status: overallOk
      ? "DIAGNOSTICS_OK"
      : "DIAGNOSTICS_WARNING",
    timestamp:
      new Date().toISOString(),
    totalDurationMs,
    checks,
  });
});



app.get("/api/ai/trade-criteria", (_req, res) => {
  try {
    res.json({
      success: true,
      criteria: getTradeCriteria(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});

app.post("/api/ai/trade-criteria", (req, res) => {
  try {
    const criteria =
      saveTradeCriteria(
        req.body || {}
      );

    console.log(
      "Trade criteria updated:",
      criteria
    );

    res.json({
      success: true,
      criteria,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});


app.listen(PORT, () => {
  console.log(
    `TradeMindMZ V2 server running on port ${PORT}`
  );

  console.log(
    "Pionex trading execution: DISABLED"
  );
});

export default app;

/*
 * TradeMindMZ V2
 * Direct Pionex live positions
 * READ-ONLY — no order execution.
 */
import {
  fetchPionexLivePositions
} from "./pionex/livePositions.js";

app.get(
  "/api/pionex/live-positions",
  async (_req, res) => {
    try {
      const result =
        await fetchPionexLivePositions();

      res.json(result);
    } catch (error) {
      console.error(
        "Pionex live positions error:",
        error
      );

      res.status(500).json({
        success: false,
        source: "PIONEX",
        error:
          error?.message ||
          "Unable to fetch Pionex live positions"
      });
    }
  }
);
