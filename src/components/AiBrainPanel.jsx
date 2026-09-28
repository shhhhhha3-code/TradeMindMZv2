import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Cpu,
  Database,
  Gauge,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { apiUrl } from "../services/apiBase.js";
import "../ui/trademind-ai-brain.css";

const WINDOWS = [
  ["24h", "24H"],
  ["7d", "7D"],
  ["30d", "30D"],
];

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(value, digits = 1) {
  const n = finite(value);
  return n === null ? "—" : `${n.toFixed(digits)}%`;
}

function num(value, digits = 2) {
  const n = finite(value);
  return n === null ? "—" : n.toFixed(digits);
}

function ageSeconds(value) {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}

function ageLabel(value) {
  const seconds = finite(value);
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function tone(status) {
  const value = String(status || "").toUpperCase();
  if (["OK", "ONLINE", "ACTIVE", "FRESH", "CONFIGURED", "PASSED"].includes(value)) return "good";
  if (["SLOW", "STALE", "PENDING", "SHADOW", "OBSERVE_ONLY", "DEGRADED"].includes(value)) return "warn";
  if (["ERROR", "OFFLINE", "FAILED", "INSUFFICIENT"].includes(value)) return "bad";
  return "neutral";
}

function fetchJson(path) {
  return fetch(apiUrl(path), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
    return data;
  });
}

function StatusPill({ status, label }) {
  return (
    <span className={`tmz-brain-pill ${tone(status)}`}>
      <i /> {label || String(status || "UNKNOWN").replaceAll("_", " ")}
    </span>
  );
}

function Metric({ label, value, detail, icon: Icon = Activity, className = "" }) {
  return (
    <div className={`tmz-brain-metric ${className}`}>
      <div className="tmz-brain-metric-icon"><Icon /></div>
      <div className="tmz-brain-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </div>
  );
}

function Section({ eyebrow, title, icon: Icon, children, className = "" }) {
  return (
    <section className={`tmz-brain-section ${className}`}>
      <div className="tmz-brain-section-head">
        <div className="tmz-brain-section-title">
          {Icon ? <Icon /> : <BrainCircuit />}
          <div>
            <span>{eyebrow}</span>
            <h2>{title}</h2>
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

function WindowCard({ label, data }) {
  const closed = data?.closed ?? data?.trades ?? 0;
  const winRate = finite(data?.winRate);
  const pnl = finite(data?.netPnl ?? data?.totalPnlPercent);
  return (
    <div className={`tmz-brain-window ${pnl > 0 ? "positive" : pnl < 0 ? "negative" : ""}`}>
      <div className="tmz-brain-window-head">
        <span>LAST {label}</span>
        <b>{closed} TRADES</b>
      </div>
      <strong>{pnl === null ? "—" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%`}</strong>
      <div className="tmz-brain-window-grid">
        <span><small>WIN RATE</small><b>{winRate === null ? "—" : `${winRate.toFixed(1)}%`}</b></span>
        <span><small>W / L</small><b>{data?.wins ?? 0} / {data?.losses ?? 0}</b></span>
        <span><small>AVG</small><b>{num(data?.avgPnl ?? data?.avgPnlPercent)}%</b></span>
        <span><small>PF</small><b>{data?.profitFactor == null ? "—" : num(data.profitFactor)}</b></span>
      </div>
    </div>
  );
}

function groupLabel(item) {
  return String(item?.group || "UNKNOWN").replaceAll("_", " ");
}

export default function AiBrainPanel() {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [windowKey, setWindowKey] = useState("24h");
  const [error, setError] = useState("");

  const load = async (silent = false) => {
    if (silent) setRefreshing(true);
    setError("");
    try {
      const results = await Promise.allSettled([
        fetchJson("/api/diagnostics"),
        fetchJson("/api/ai/performance-summary"),
        fetchJson("/api/ai/learning-stats"),
        fetchJson("/api/ai/position-monitoring"),
        fetchJson("/api/ai/signal-history?limit=20"),
      ]);
      const [diagnostics, performance, learning, positionMonitoring, signalHistory] = results.map((r) =>
        r.status === "fulfilled" ? r.value : { success: false, error: r.reason?.message || "Unavailable" }
      );
      setData({ diagnostics, performance, learning, positionMonitoring, signalHistory, fetchedAt: new Date().toISOString() });
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === results.length) throw new Error("AI HJERNE data sources are unavailable.");
    } catch (err) {
      setError(err?.message || "AI HJERNE could not load.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const diagnostics = data?.diagnostics || {};
  const checks = Array.isArray(diagnostics?.checks) ? diagnostics.checks : [];
  const checkMap = useMemo(() => Object.fromEntries(checks.map((item) => [item.name, item])), [checks]);

  const performance = data?.performance || {};
  const tradeWindows = performance?.windows || {};
  const selectedPerformance = tradeWindows?.[windowKey] || {};
  const behaviorGroups = [];
  const decisionGroups = [];
  const marketGroups = [];
  const recent = Array.isArray(data?.signalHistory?.history) ? data.signalHistory.history.slice(0, 8) : [];

  const scheduler = checkMap.Scheduler?.details || {};
  const marketAi = checkMap["Market AI"]?.details || {};
  const engineStatus = checkMap.Engine || checkMap["Engine V2"] || null;
  const schedulerStatus = checkMap.Scheduler?.status || "UNKNOWN";
  const schedulerHeartbeatAge = finite(scheduler?.ageSeconds);
  const schedulerIsFresh = schedulerHeartbeatAge !== null && schedulerHeartbeatAge <= (scheduler?.cadenceMinutes ?? 7) * 60 * 1.75;
  const marketAiStatus = checkMap["Market AI"]?.status || "UNKNOWN";
  const groqStatus = checkMap["Groq AI"]?.status || "UNKNOWN";
  const activeCriteria = {};
  const proposal = null;
  const validation = {};
  const learningSamples = performance?.learning?.samples ?? data?.learning?.totalAnalyses ?? 0;
  const positionJournal = data?.positionMonitoring?.journalStats || {};

  const brainState = schedulerStatus === "ERROR" || tone(marketAiStatus) === "bad" || (schedulerStatus === "STALE" && !schedulerIsFresh)
    ? "ATTENTION"
    : "ONLINE";

  const freshness = ageSeconds(
    scheduler?.heartbeatAt ||
    scheduler?.lastRun ||
    marketAi?.updatedAt ||
    data?.fetchedAt
  );

  return (
    <div className="tmz-ai-brain">
      <div className="tmz-brain-hero">
        <div className="tmz-brain-hero-glow" />
        <div className="tmz-brain-visual">
          <div className="tmz-brain-orbit orbit-one" />
          <div className="tmz-brain-orbit orbit-two" />
          <div className="tmz-brain-core">
            <BrainCircuit />
            <span className="tmz-brain-core-pulse" />
          </div>
          <i className="tmz-brain-node n1" /><i className="tmz-brain-node n2" /><i className="tmz-brain-node n3" /><i className="tmz-brain-node n4" />
        </div>

        <div className="tmz-brain-hero-copy">
          <div className="tmz-brain-kicker"><Sparkles /> TRADEMINDMZ INTELLIGENCE CORE</div>
          <h1>AI HJERNE</h1>
          <p>Engine · Copilot · Market Learning · Microstructure · Scheduler</p>
          <div className="tmz-brain-hero-status">
            <StatusPill status={brainState === "ONLINE" ? "ONLINE" : "ERROR"} label={brainState} />
            <StatusPill status="OBSERVE_ONLY" label="OBSERVE ONLY" />
            <span className="tmz-brain-freshness"><i /> DATA {ageLabel(freshness)}</span>
          </div>
        </div>

        <button className="tmz-brain-refresh" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw className={refreshing ? "spin" : ""} /> {refreshing ? "SYNCING" : "SYNC BRAIN"}
        </button>
      </div>

      {error ? <div className="tmz-brain-error"><CircleAlert /><span>{error}</span></div> : null}

      <div className="tmz-brain-system-grid">
        <Metric label="ENGINE" value={engineStatus?.status || "ONLINE"} detail="Deterministic decision layer" icon={Cpu} />
        <Metric label="COPILOT / AI" value={groqStatus || "ONLINE"} detail="Analysis only · no execution" icon={Sparkles} />
        <Metric label="MARKET AI" value={marketAiStatus} detail={`${marketAi?.scanned ?? 0} markets · ${marketAi?.candidates ?? 0} candidates`} icon={Zap} />
        <Metric label="SCHEDULER" value={schedulerStatus === "STALE" && schedulerIsFresh ? "OK" : schedulerStatus} detail={`Heartbeat ${ageLabel(schedulerHeartbeatAge)} · ${scheduler?.cadenceMinutes ?? 7} min · ${scheduler?.currentStage || "idle"}`} icon={Clock3} />
      </div>

      <Section eyebrow="SYSTEM INTELLIGENCE" title="Core health & telemetry" icon={Gauge}>
        <div className="tmz-brain-health-grid">
          {[
            ["Engine", engineStatus?.status || "ONLINE", engineStatus?.details?.service || "Deterministic Engine"],
            ["Market Data", checkMap["Market API"]?.status || "UNKNOWN", checkMap["Market API"]?.details?.scanned ? `${checkMap["Market API"].details.scanned} scanned` : "Pionex market feed"],
            ["Pionex", checkMap.Pionex?.status || "UNKNOWN", `${checkMap.Pionex?.details?.openPositions ?? 0} open positions`],
            ["Scheduler", schedulerStatus, scheduler?.currentStage || "Heartbeat"],
            ["Market AI", marketAiStatus, `${marketAi?.finalDecision || "NO_TRADE"} · age ${ageLabel(marketAi?.snapshotAgeSeconds)}`],
            ["Persistence", checkMap.Supabase?.status || "UNKNOWN", "Learning / snapshot storage"],
            ["Groq AI", groqStatus, "Provider configuration"],
            ["Learning", learningSamples > 0 ? "ACTIVE" : "WAITING", `${learningSamples} AI analyses`],
          ].map(([label, status, detail]) => (
            <div className="tmz-brain-health-row" key={label}>
              <span className={tone(status)}><i /> {label}</span>
              <b>{String(status || "UNKNOWN").replaceAll("_", " ")}</b>
              <small>{detail}</small>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="LEARNING WINDOW" title="Did the system learn something new?" icon={BrainCircuit}>
        <div className="tmz-brain-tabs">
          {WINDOWS.map(([key, label]) => (
            <button key={key} className={windowKey === key ? "active" : ""} onClick={() => setWindowKey(key)}>{label}</button>
          ))}
        </div>

        <div className="tmz-brain-windows">
          {WINDOWS.map(([key, label]) => <WindowCard key={key} label={label} data={tradeWindows?.[key]}  />)}
        </div>

        <div className="tmz-brain-learning-banner">
          <div>
            <span><Sparkles /> LEARNING STATUS</span>
            <strong>{(tradeWindows?.[windowKey]?.closed ?? tradeWindows?.[windowKey]?.trades ?? 0) > 0 ? "NEW LEARNING AVAILABLE" : "WAITING FOR CLOSED TRADE OUTCOMES"}</strong>
            <p>
              {tradeWindows?.[windowKey]?.closed ?? tradeWindows?.[windowKey]?.trades ?? 0} closed trades in the selected window · {positionJournal?.open ?? 0} open journal positions.
              Learning is observational and does not modify live signals automatically.
            </p>
          </div>
          <div className="tmz-brain-learning-big">{tradeWindows?.[windowKey]?.closed ?? tradeWindows?.[windowKey]?.trades ?? 0}</div>
        </div>

        <div className="tmz-brain-selected-window">
          <Metric label="CLOSED TRADES" value={selectedPerformance?.closed ?? selectedPerformance?.trades ?? 0} detail="Closed Pionex journal trades used for learning" icon={Target} />
          <Metric label="JOURNAL" value={positionJournal?.total ?? 0} detail={positionJournal?.open + " open · " + positionJournal?.closed + " closed"} icon={Database} />
          <Metric label="WIN RATE" value={pct(selectedPerformance?.winRate)} detail={(selectedPerformance?.wins ?? 0) + " wins · " + (selectedPerformance?.losses ?? 0) + " losses"} icon={Gauge} />
          <Metric label="AVG PNL" value={pct(selectedPerformance?.avgPnl, 2)} detail="Average closed-trade result" icon={Activity} />
          <Metric label="PROFIT FACTOR" value={selectedPerformance?.profitFactor == null ? "—" : num(selectedPerformance.profitFactor)} detail="Closed-trade performance" icon={Database} />
        </div></div>
      </Section>

      <div className="tmz-brain-two-col">
        <Section eyebrow="TRADE OUTCOMES" title="What the Engine is learning from" icon={Activity}>
          <div className="tmz-brain-list">
            {behaviorGroups.length ? behaviorGroups.map((item) => (
              <div className="tmz-brain-list-row" key={String(item.group)}>
                <span>{groupLabel(item)}</span>
                <b>{item.samples}</b>
                <em>{pct(item.favorableRate)} favorable</em>
                <small>avg {pct(item.avgFinalReturnPct, 2)} · MFE {pct(item.avgMfePct, 2)} · MAE {pct(item.avgMaePct, 2)}</small>
              </div>
            )) : <div className="tmz-brain-empty">Closed-trade outcome data is building from the server trade journal.</div>}
          </div>
        </Section>

        <Section eyebrow="DECISION FEEDBACK" title="Recent Engine / AI events" icon={GitBranch}>
          <div className="tmz-brain-list">
            {decisionGroups.length ? decisionGroups.map((item) => (
              <div className="tmz-brain-list-row" key={String(item.group)}>
                <span>{groupLabel(item)}</span>
                <b>{item.samples}</b>
                <em>{pct(item.favorableRate)} favorable</em>
                <small>avg {pct(item.avgFinalReturnPct, 2)}</small>
              </div>
            )) : <div className="tmz-brain-empty">No recent Engine / AI history is available.</div>}
          </div>
        </Section>
      </div>

      <Section eyebrow="MARKET MICROSTRUCTURE" title="Flow, regime & market type learning" icon={Activity}>
        <div className="tmz-brain-market-grid">
          {marketGroups.length ? marketGroups.map((item) => (
            <div className="tmz-brain-market-card" key={String(item.group)}>
              <span>{groupLabel(item)}</span>
              <strong>{item.samples}</strong>
              <small>{pct(item.favorableRate)} favorable · avg {pct(item.avgFinalReturnPct, 2)}</small>
            </div>
          )) : <div className="tmz-brain-empty">Microstructure journal is not exposed by the current Edge learning API.</div>}
        </div>
      </Section>

      <Section eyebrow="PARAMETER INTELLIGENCE" title="What the Copilot is allowed to change" icon={ShieldCheck}>
        <div className="tmz-brain-parameter-grid">
          {Object.entries(activeCriteria || {}).slice(0, 8).map(([key, value]) => {
            const display = typeof value === "object" ? JSON.stringify(value) : String(value);
            return <div key={key}><span>{key.replace(/([A-Z])/g, " $1").toUpperCase()}</span><b>{display}</b></div>;
          })}
          {!Object.keys(activeCriteria || {}).length ? <div className="tmz-brain-empty">Active parameter criteria are not exposed by this Edge API yet.</div> : null}
        </div>
        <div className="tmz-brain-validation">
          <div><span>MODE</span><b>SHADOW / GOVERNED</b></div>
          <div><span>VALIDATION</span><b>{validation?.status || "READ ONLY"}</b></div>
          <div><span>PROPOSAL</span><b>{proposal ? "AVAILABLE" : "NOT EXPOSED"}</b></div>
          <div><span>AUTO PROMOTION</span><b>OFF</b></div>
        </div>
        <div className="tmz-brain-safety"><ShieldCheck /> Parameter learning can propose and validate changes, but live criteria are not silently modified.</div>
      </Section>

      <Section eyebrow="LEARNING TIMELINE" title="Latest intelligence events" icon={Clock3}>
        <div className="tmz-brain-timeline">
          {recent.length ? recent.map((item, index) => (
            <div className="tmz-brain-timeline-row" key={item.id || index}>
              <i />
              <div>
                <strong>{item.symbol || "UNKNOWN"} · {item.direction || "—"} · {item.outcome || item.status || "OBSERVATION"}</strong>
                <span>{item.type || "EVENT"} · {item.source || "TRADEMINDMZ"} · {item.provider || "ENGINE"}</span>
              </div>
              <small>{item.closedAt ? new Date(item.closedAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }) : item.createdAt ? new Date(item.createdAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }) : "—"}</small>
            </div>
          )) : <div className="tmz-brain-empty">No completed intelligence events yet.</div>}
        </div>
      </Section>

      <div className="tmz-brain-footer">
        <span><CheckCircle2 /> READ ONLY · NO AUTOMATIC TRADING</span>
        <span><Database /> ONE SOURCE OF TRUTH · ENGINE REMAINS AUTHORITATIVE</span>
        <span>LAST SYNC {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span>
      </div>
    </div>
  );
}
