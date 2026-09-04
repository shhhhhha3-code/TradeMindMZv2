import React from "react";
import {
  Activity,
  Brain,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

function recommendationClass(
  recommendation
) {
  return (
    `live-position-recommendation ` +
    `recommendation-${String(
      recommendation || "HOLD"
    ).toLowerCase()}`
  );
}

export default function LivePositionsPanel({
  positions = [],
  loading = false,
  error = "",
  onRefresh,
}) {
  return (
    <section className="live-positions-panel">

      <div className="live-positions-header">

        <div>
          <div className="live-positions-title">
            <Activity size={18} />
            LIVE POSITIONS
          </div>

          <div className="live-positions-subtitle">
            Pionex · Read only · AI monitoring
          </div>
        </div>

        <button
          type="button"
          className="live-refresh-button"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw
            size={15}
            className={
              loading
                ? "ai-spin"
                : ""
            }
          />

          {loading
            ? "ANALYZING..."
            : "REFRESH"}
        </button>

      </div>

      {error && (
        <div className="live-position-error">
          {error}
        </div>
      )}

      {!positions.length && !error && (
        <div className="live-position-empty">
          <ShieldCheck size={20} />

          <div>
            <strong>
              No live positions detected
            </strong>

            <span>
              Open a position manually in
              Pionex to start AI monitoring.
            </span>
          </div>
        </div>
      )}

      <div className="live-position-list">

        {positions.map((position) => (
          <article
            className="live-position-card"
            key={position.id || position.symbol}
          >

            <div className="live-position-card-top">

              <div>
                <strong>
                  {position.symbol}
                </strong>

                <span>
                  {position.side} ·{" "}
                  {position.status}
                </span>
              </div>

              <div className="live-position-badge">
                LIVE
              </div>

            </div>

            <div className="live-position-metrics">

              <div>
                <span>ENTRY</span>
                <strong>
                  {position.entryPrice ??
                    "—"}
                </strong>
              </div>

              <div>
                <span>QTY</span>
                <strong>
                  {position.quantity ??
                    "—"}
                </strong>
              </div>

              <div>
                <span>CONFIDENCE</span>
                <strong>
                  {position.confidence}%
                </strong>
              </div>

            </div>

            <div className="live-position-ai">

              <div className="live-position-ai-title">
                <Brain size={15} />
                AI RECOMMENDATION
              </div>

              <div
                className={
                  recommendationClass(
                    position.recommendation
                  )
                }
              >
                {position.recommendation}
              </div>

              {position.reasoning && (
                <p>
                  {position.reasoning}
                </p>
              )}

            </div>

          </article>
        ))}

      </div>

      <div className="live-position-safety">
        <ShieldCheck size={15} />

        AI recommendations only.
        TradeMindMZ never opens,
        closes or modifies Pionex orders.
      </div>

    </section>
  );
}
