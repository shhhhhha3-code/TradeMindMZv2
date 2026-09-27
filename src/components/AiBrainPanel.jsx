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

function WindowCard({ label, data, behavior }) {
  const closed = data?.closed ?? 0;
  const winRate = finite(data?.winRate);
  const pnl = finite(data?.netPnl);
  const samples = behavior?.samples ?? 0;
  return (
    <div className={`tmz-brain-window ${pnl > 0 ? "positive" : pnl < 0 ? "negative" : ""}`}>
      <div className="tmz-brain-window-head">
        <span>LAST {label}</span>
        <b>{closed} CLOSED</b>
      </div>
      <strong>{pnl === null ? "—" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%`}</strong>
      <div className="tmz-brain-window-grid">
        <span><small>WIN RATE</small><b>{winRate === null ? "—" : `${winRate.toFixed(1)}%`}</b></span>
        <span><small>W / L</small><b>{data?.wins ?? 0} / {data?.losses ?? 0}</b></span>
        <span><small>AVG</small><b>{num(data?.avgPnl)}%</b></span>
        <span><small>PF</small><b>{data?.profitFactor == null ? "—" : num(data.profitFactor)}</b></span>
        <span><small>OBSERVED</small><b>{samples}</b></span>
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
        fetchJson("/api/ai/market-behavior"),
        fetchJson("/api/ai/performance-summary"),
        fetchJson("/api/ai/copilot/parameters"),
        fetchJson("/api/ai/learning-stats"),
      ]);
      const [diagnostics, behavior, performance, parameters, learning] = results.map((r) =>
        r.status === "fulfilled" ? r.value : { success: false, error: r.reason?.message || "Unavailable" }
      );
      setData({ diagnostics, behavior, performance, parameters, learning, fetchedAt: new Date().toISOString() });
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

  const behavior = data?.behavior || {};
  const performance = data?.performance || {};
  const windows = performance?.windows || {};
  const selectedPerformance = windows?.[windowKey] || {};
  const behaviorGroups = Array.isArray(behavior?.byRegime) ? behavior.byRegime.slice(0, 5) : [];
  const decisionGroups = Array.isArray(behavior?.byEngineDecision) ? behavior.byEngineDecision.slice(0, 5) : [];
  const marketGroups = Array.isArray(behavior?.byMarketType) ? behavior.byMarketType.slice(0, 4) : [];
  const recent = Array.isArray(behavior?.recent) ? behavior.recent.slice(0, 8) : [];

  const scheduler = checkMap.Scheduler?.details || {};
  const marketAi = checkMap["Market AI"]?.details || {};
  const engineStatus = checkMap.Engine || checkMap["Engine V2"] || null;
  const schedulerStatus = checkMap.Scheduler?.status || "UNKNOWN";
  const marketAiStatus = checkMap["Market AI"]?.status || "UNKNOWN";
  const groqStatus = checkMap["Groq AI"]?.status || "UNKNOWN";
  const parameterStatus = data?.parameters || {};
  const activeCriteria = parameterStatus?.active || parameterStatus?.activeCriteria || parameterStatus?.current || parameterStatus?.criteria || {};
  const proposal = parameterStatus?.proposal || parameterStatus?.latestProposal || null;
  const validation = proposal?.validation || parameterStatus?.validation || parameterStatus?.lastValidation || {};
  const learningSamples = data?.learning?.totalAnalyses ?? 0;

  const brainState = tone(schedulerStatus) === "bad" || tone(marketAiStatus) === "bad" ? "ATTENTION" : "ONLINE";

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
        <Metric label="SCHEDULER" value={schedulerStatus} detail={`Heartbeat ${ageLabel(scheduler?.ageSeconds)} · ${scheduler?.cadenceMinutes ?? 7} min`} icon={Clock3} />
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
          {WINDOWS.map(([key, label]) => <WindowCard key={key} label={label} data={windows?.[key]} behavior={behavior} />)}
        </div>

        <div className="tmz-brain-learning-banner">
          <div>
            <span><Sparkles /> LEARNING STATUS</span>
            <strong>{(behavior?.closedSignals ?? 0) > 0 ? "NEW OBSERVATIONS AVAILABLE" : "WAITING FOR MORE OBSERVATIONS"}</strong>
            <p>
              {behavior?.closedSignals ?? 0} completed market-behavior observations · {behavior?.activeSignals ?? 0} active signal paths.
              Learning is observational and does not modify live signals automatically.
            </p>
          </div>
          <div className="tmz-brain-learning-big">{behavior?.closedSignals ?? 0}</div>
        </div>

        <div className="tmz-brain-selected-window">
          <Metric label={`${windowKey.toUpperCase()} CLOSED`} value={selectedPerformance?.closed ?? 0} detail="Closed trade outcomes" icon={Target} />
          <Metric label="WIN RATE" value={pct(selectedPerformance?.winRate)} detail={`${selectedPerformance?.wins ?? 0} wins · ${selectedPerformance?.losses ?? 0} losses`} icon={Gauge} />
          <Metric label="NET P&L" value={pct(selectedPerformance?.netPnl, 2)} detail={`Average ${pct(selectedPerformance?.avgPnl, 2)}`} icon={Activity} />
          <Metric label="BEHAVIOR SAMPLES" value={behavior?.closedSignals ?? 0} detail={`MFE ${pct(behavior?.overall?.avgMfePct, 2)} · MAE ${pct(behavior?.overall?.avgMaePct, 2)}`} icon={Database} />
        </div>
      </Section>

      <div className="tmz-brain-two-col">
        <Section eyebrow="MARKET BEHAVIOR" title="What the Engine is observing" icon={Activity}>
          <div className="tmz-brain-list">
            {behaviorGroups.length ? behaviorGroups.map((item) => (
              <div className="tmz-brain-list-row" key={String(item.group)}>
                <span>{groupLabel(item)}</span>
                <b>{item.samples}</b>
                <em>{pct(item.favorableRate)} favorable</em>
                <small>avg {pct(item.avgFinalReturnPct, 2)} · MFE {pct(item.avgMfePct, 2)} · MAE {pct(item.avgMaePct, 2)}</small>
              </div>
            )) : <div className="tmz-brain-empty">Regime data builds automatically as signal paths complete.</div>}
          </div>
        </Section>

        <Section eyebrow="DECISION FEEDBACK" title="Engine outcomes" icon={GitBranch}>
          <div className="tmz-brain-list">
            {decisionGroups.length ? decisionGroups.map((item) => (
              <div className="tmz-brain-list-row" key={String(item.group)}>
                <span>{groupLabel(item)}</span>
                <b>{item.samples}</b>
                <em>{pct(item.favorableRate)} favorable</em>
                <small>avg {pct(item.avgFinalReturnPct, 2)}</small>
              </div>
            )) : <div className="tmz-brain-empty">No completed decision feedback yet.</div>}
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
          )) : <div className="tmz-brain-empty">Microstructure observations will appear here as completed signal paths accumulate.</div>}
        </div>
      </Section>

      <Section eyebrow="PARAMETER INTELLIGENCE" title="What the Copilot is allowed to change" icon={ShieldCheck}>
        <div className="tmz-brain-parameter-grid">
          {Object.entries(activeCriteria || {}).slice(0, 8).map(([key, value]) => {
            const display = typeof value === "object" ? JSON.stringify(value) : String(value);
            return <div key={key}><span>{key.replace(/([A-Z])/g, " $1").toUpperCase()}</span><b>{display}</b></div>;
          })}
          {!Object.keys(activeCriteria || {}).length ? <div className="tmz-brain-empty">Active criteria unavailable.</div> : null}
        </div>
        <div className="tmz-brain-validation">
          <div><span>MODE</span><b>SHADOW / GOVERNED</b></div>
          <div><span>VALIDATION</span><b>{validation?.status || "PENDING"}</b></div>
          <div><span>PROPOSAL</span><b>{proposal ? "AVAILABLE" : "NONE"}</b></div>
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
                <span>{item.regime || "UNKNOWN"} · {item.marketType || "PERP"} · Engine {item.engineDecision || "UNKNOWN"}</span>
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
