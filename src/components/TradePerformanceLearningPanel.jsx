import React, { useEffect, useState } from "react";
import { Activity, BrainCircuit, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { fetchTradePerformanceSummary } from "../services/tradePerformanceService.js";

function fmtPnl(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
}

function fmtPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function statusTone(status) {
  if (status === "POSITIVE") return "positive";
  if (status === "UNDER_PRESSURE") return "negative";
  if (status === "MIXED") return "mixed";
  return "neutral";
}

function WindowCard({ label, data }) {
  const pnl = Number(data?.netPnl);
  const tone = pnl > 0 ? "positive" : pnl < 0 ? "negative" : "neutral";
  return (
    <div className={`tmz-performance-window ${tone}`}>
      <div className="tmz-performance-window-head">
        <span>{label}</span>
        <b>{data?.closed ?? 0} CLOSED</b>
      </div>
      <div className="tmz-performance-pnl">{fmtPnl(data?.netPnl)}</div>
      <div className="tmz-performance-grid">
        <span><small>WIN RATE</small><strong>{fmtPercent(data?.winRate)}</strong></span>
        <span><small>W / L</small><strong>{data?.wins ?? 0} / {data?.losses ?? 0}</strong></span>
        <span><small>AVG</small><strong>{fmtPnl(data?.avgPnl)}</strong></span>
        <span><small>PF</small><strong>{data?.profitFactor == null ? "—" : Number(data.profitFactor).toFixed(2)}</strong></span>
      </div>
    </div>
  );
}

export default function TradePerformanceLearningPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      setData(await fetchTradePerformanceSummary());
    } catch (err) {
      setError(err?.message || "Performance data unavailable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 60000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading && !data) {
    return <section className="tmz-performance-panel"><div className="tmz-performance-loading">LOADING PERFORMANCE INTELLIGENCE…</div></section>;
  }

  if (error && !data) {
    return (
      <section className="tmz-performance-panel">
        <div className="tmz-performance-error">
          <b>PERFORMANCE INTELLIGENCE OFFLINE</b>
          <span>{error}</span>
          <button type="button" onClick={() => load()}><RefreshCw/> RETRY</button>
        </div>
      </section>
    );
  }

  const tone = statusTone(data?.status);
  const learning = data?.learning || {};
  const buckets = learning.confidenceBuckets || {};
  const recentLosses = Array.isArray(data?.recentLosses) ? data.recentLosses : [];

  return (
    <section className={`tmz-performance-panel ${tone}`}>
      <div className="tmz-performance-head">
        <div>
          <div className="tmz-performance-kicker"><Activity/> PERFORMANCE INTELLIGENCE</div>
          <h2>TRADEMINDMZ STATUS</h2>
          <p>Closed-trade results, recent pressure and AI calibration feedback.</p>
        </div>
        <div className="tmz-performance-head-actions">
          <span className="tmz-performance-status"><i/>{String(data?.status || "INSUFFICIENT_DATA").replaceAll("_"," ")}</span>
          <span className="tmz-performance-trend">7D {String(data?.trend || "INSUFFICIENT_DATA").replaceAll("_"," ")}</span>
          <button type="button" onClick={() => load(true)} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : ""}/></button>
        </div>
      </div>

      <div className="tmz-performance-windows">
        <WindowCard label="LAST 24H" data={data?.windows?.["24h"]}/>
        <WindowCard label="LAST 7D" data={data?.windows?.["7d"]}/>
        <WindowCard label="LAST 30D" data={data?.windows?.["30d"]}/>
      </div>

      <div className="tmz-performance-learning">
        <div className="tmz-performance-learning-title">
          <BrainCircuit/>
          <div>
            <b>AI LEARNING FEEDBACK</b>
            <span>OBSERVE ONLY · NO SIGNAL OVERRIDE</span>
          </div>
        </div>
        <div className="tmz-performance-learning-metrics">
          <span><small>SAMPLES</small><b>{learning.samples ?? 0}</b></span>
          <span><small>AVG CONFIDENCE</small><b>{fmtPercent(learning.averageConfidence)}</b></span>
          <span><small>ACTUAL WIN RATE</small><b>{fmtPercent(learning.actualWinRate)}</b></span>
          <span><small>CONFIDENCE GAP</small><b>{learning.confidenceGap == null ? "—" : (learning.confidenceGap >= 0 ? "+" : "") + Number(learning.confidenceGap).toFixed(1) + "pp"}</b></span>
        </div>
        <div className="tmz-performance-buckets">
          {Object.entries(buckets).map(([name, bucket]) => (
            <div key={name}><span>{name}</span><b>{bucket?.trades ?? 0}</b><em>{fmtPercent(bucket?.winRate)}</em></div>
          ))}
        </div>
      </div>

      <div className="tmz-performance-foot">
        <span><i/> FEEDBACK FROM CLOSED TRADES</span>
        <span>LAST UPDATE {data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("nb-NO",{hour:"2-digit",minute:"2-digit"}) : "—"}</span>
        {recentLosses.length > 0 && <span className="loss"><TrendingDown/> {recentLosses.length} RECENT LOSSES</span>}
        {recentLosses.length === 0 && <span className="win"><TrendingUp/> NO RECENT LOSSES LOGGED</span>}
      </div>
    </section>
  );
}
