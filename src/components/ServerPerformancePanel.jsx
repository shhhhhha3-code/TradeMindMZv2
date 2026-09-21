import React, { useEffect, useState } from "react";
import { apiUrl } from "../services/apiBase.js";

export default function ServerPerformancePanel() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(apiUrl("/api/ai/position-monitoring"), {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const data = await response.json();
        if (active && data?.success) setStats(data?.journalStats || null);
      } catch {}
    };
    load();
    const timer = setInterval(load, 60000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  if (!stats) return null;

  return (
    <section className="panel" style={{marginTop:"18px"}}>
      <div className="settinghead">
        <div>
          <h3>AI VS ACTUAL RESULTS</h3>
          <p>Measured from the server-side Trade Journal. No simulated winners are included.</p>
        </div>
        <span className="status on"><i/>LIVE DATA</span>
      </div>

      <div className="costgrid" style={{marginTop:"14px"}}>
        <span><b>{stats.closed ?? 0}</b><small>CLOSED</small></span>
        <span><b>{stats.positiveRate != null ? stats.positiveRate + "%" : "—"}</b><small>WIN RATE</small></span>
        <span><b>{stats.profitFactor != null ? Number(stats.profitFactor).toFixed(2) : "—"}</b><small>PROFIT FACTOR</small></span>
        <span><b>{stats.closedPnl != null ? Number(stats.closedPnl).toFixed(2) : "—"}</b><small>NET PNL</small></span>
        <span><b>{stats.averageAiConfidenceAtEntry != null ? Number(stats.averageAiConfidenceAtEntry).toFixed(1) + "%" : "—"}</b><small>AI CONF. AVG</small></span>
      </div>

      {Array.isArray(stats.confidenceBuckets) && stats.confidenceBuckets.length ? (
        <div style={{marginTop:"14px"}}>
          <small style={{opacity:.45}}>AI CONFIDENCE VS CLOSED RESULT</small>
          <div className="costgrid" style={{marginTop:"8px"}}>
            {stats.confidenceBuckets.map(bucket => (
              <span key={bucket.label}>
                <b>{bucket.winRate != null ? bucket.winRate + "%" : "—"}</b>
                <small>{bucket.label} • {bucket.closed} closed</small>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
