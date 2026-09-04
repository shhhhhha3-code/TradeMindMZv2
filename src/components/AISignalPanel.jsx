import React from "react";
import { Brain, RefreshCw, ShieldCheck } from "lucide-react";

export default function AISignalPanel({
  result,
  loading = false,
  error = "",
  onAnalyze,
}) {
  const signal = result?.ai?.signal;
  const available = result?.ai?.available === true;

  return (
    <section className="ai-signal-panel">

      <div className="ai-panel-header">

        <div>
          <div className="ai-panel-title">
            <Brain size={18} />
            AI MARKET ANALYSIS
          </div>

          <div className="ai-panel-subtitle">
            Historical + technical evidence
          </div>
        </div>

        <button
          type="button"
          className="ai-analyze-button"
          onClick={onAnalyze}
          disabled={loading}
        >
          <RefreshCw
            size={15}
            className={loading ? "ai-spin" : ""}
          />

          {loading ? "ANALYZING..." : "ANALYZE"}
        </button>

      </div>

      {error ? (
        <div className="ai-error">
          {error}
        </div>
      ) : null}

      {!available && !loading ? (
        <div className="ai-empty">

          <ShieldCheck size={22} />

          <div>
            <strong>
              No AI signal yet
            </strong>

            <span>
              Run an analysis to generate
              the recommended signal.
            </span>
          </div>

        </div>
      ) : null}

      {loading ? (
        <div className="ai-empty">

          <RefreshCw
            size={22}
            className="ai-spin"
          />

          <div>
            <strong>
              Analyzing market...
            </strong>

            <span>
              Checking market data,
              indicators and historical evidence.
            </span>
          </div>

        </div>
      ) : null}

      {available && signal ? (

        <div className="ai-signal-result">

          <div className="best-recommended">

            <span>
              BEST RECOMMENDED
            </span>

            <strong>
              {signal.direction || "NEUTRAL"}
            </strong>

          </div>

          <div className="ai-signal-grid">

            <div>
              <span>Recommendation</span>
              <strong>
                {signal.recommendation ||
                  signal.direction ||
                  "—"}
              </strong>
            </div>

            <div>
              <span>Score</span>
              <strong>
                {signal.score ?? 0}/100
              </strong>
            </div>

            <div>
              <span>Confidence</span>
              <strong>
                {signal.confidence ?? 0}%
              </strong>
            </div>

            <div>
              <span>Risk / Reward</span>
              <strong>
                {signal.riskReward
                  ? `1:${Number(
                      signal.riskReward
                    ).toFixed(2)}`
                  : "—"}
              </strong>
            </div>

          </div>

          <div className="ai-price-grid">

            <div>
              <span>Entry</span>
              <strong>
                {signal.entry ?? "—"}
              </strong>
            </div>

            <div>
              <span>Stop Loss</span>
              <strong>
                {signal.stopLoss ?? "—"}
              </strong>
            </div>

            <div>
              <span>Take Profit</span>
              <strong>
                {signal.takeProfit ?? "—"}
              </strong>
            </div>

          </div>

          {signal.reasoning ? (
            <div className="ai-reasoning">

              <span>
                AI reasoning
              </span>

              <p>
                {signal.reasoning}
              </p>

            </div>
          ) : null}

          {result.ai.provider ? (
            <div className="ai-provider">
              Provider:{" "}
              <strong>
                {result.ai.provider}
              </strong>
            </div>
          ) : null}

        </div>

      ) : null}

    </section>
  );
}
