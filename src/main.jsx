import { apiUrl } from "./services/apiBase.js";
import "./ui/trademind-v3-global.css";
import './ui/trademind-design.css';
import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{Activity,BrainCircuit,ChevronRight,History,LayoutDashboard,LineChart,Menu,Bell,RefreshCw,Settings,ShieldCheck,Target,TrendingUp,Wallet,X,Zap,Radio}from'lucide-react';import'./styles.css';
import { useLiveAiSignal } from "./services/useLiveAiSignal.js";
import ManualPurchaseModal from "./components/ManualPurchaseModal";
import TradingModeToggle from "./components/TradingModeToggle.jsx";
import PaperPerformancePanel from "./components/PaperPerformancePanel.jsx";
import LearningDashboardPanel from "./components/LearningDashboardPanel.jsx";
import LearningJournalPanel from "./components/LearningJournalPanel.jsx";
import { loadTrackedPositions } from "./positions/positionStorage.js";
import { registerManualPurchase } from "./positions/workflowIndex.js";
import { fetchLivePositions } from "./services/livePositionService.js";
import { analyzePositionWithAI } from "./services/positionAiService.js";
import { fetchLearningStats } from "./services/learningStatsService.js";
import { fetchSignalHistory } from "./services/signalHistoryService.js";
import { fetchLatestAiSignal } from "./services/liveAiSignalService.js";
import { calculateRiskSizing } from "./services/riskSizingService.js";
import { fetchDashboardData } from "./services/dashboardService.js";
import { fetchServerPositionMonitoring } from "./services/serverPositionMonitoringService.js";
import "./ui/trademind-v3.css";
import "./ui/trademind-v4.css";
import "./ui/trademind-v41.css";
import "./ui/trademind-v42.css";
import "./ui/trademind-v43.css";

import CoinLogo from "./components/CoinLogo.jsx";
import MarketSparkline from "./components/MarketSparkline.jsx";
import "./ui/trademind-terminal-v5.css";

import ProDashboard from "./components/ProDashboard.jsx";
import "./ui/trademind-dashboard-v6.css";
import "./ui/trademind-mobile.css";
import "./ui/future-terminal.css";




function Logo(){
  return (
    <div className="brand">
      <img
        src="/assets/trademindmz-logo.svg"
        alt="TradeMindMZ"
        className="tmz-brand-logo"
      />
      <div className="tmz-brand-copy">
        <strong>TRADEMIND<span>MZ</span></strong>
        <small>AI MARKET INTELLIGENCE</small>
      </div>
    </div>
  );
}
function Ring({score}){return <div className="ring" style={{'--p':score*3.6+'deg'}}><div><b>{score}</b><small>ENGINE SCORE</small></div></div>}

class SignalsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "AI Signals could not be rendered."
    };
  }

  componentDidCatch(error) {
    console.error("AI Signals render error:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="panel" style={{marginTop:"18px", padding:"24px"}}>
        <h3><BrainCircuit/> AI SIGNALS</h3>
        <strong>AI Signals kunne ikke vises.</strong>
        <p style={{marginTop:"8px", opacity:.65}}>
          Appen er fortsatt aktiv. Gå tilbake til Dashboard og åpne AI Signals på nytt.
        </p>
        {this.state.message && (
          <small style={{display:"block", marginTop:"10px", opacity:.4}}>{this.state.message}</small>
        )}
      </div>
    );
  }
}

function App(){
const[tab,setTab]=useState('dashboard'),[bought,setBought]=useState(false),[manualPurchaseOpen,setManualPurchaseOpen]=useState(false),[trackedPositions,setTrackedPositions]=useState(()=>loadTrackedPositions()),[open,setOpen]=useState(false),[purchaseDefaults,setPurchaseDefaults]=useState({symbol:"BTCUSDT",side:"LONG",entryPrice:0,stopLoss:0,takeProfit:0,holdTimeMinMinutes:0,holdTimeMaxMinutes:0,holdTimeReason:""}),[aiSettings,setAiSettings]=useState(()=>{try{return JSON.parse(localStorage.getItem('trademindmz-ai-settings'))||{ai:true,openai:true,groq:true,learning:true}}catch{return{ai:true,openai:true,groq:true,learning:true}}});const handleManualPurchase=(purchase)=>{
  const result=registerManualPurchase(purchase);

  if(!result?.success){
    throw new Error(result?.error||"Unable to register Pionex purchase.");
  }

  fetch(apiUrl("/api/positions/register-manual"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(purchase),
  }).catch(() => {});

  setTrackedPositions(loadTrackedPositions());
  setBought(true);
  setManualPurchaseOpen(false);
  setTab('positions');

  window.dispatchEvent(
    new Event('trademindmz-position-updated')
  );

  return result;
};

const handleDashboardTradeSelect=(recommendation)=>{
  if(!recommendation) return;
  const directionRaw=String(recommendation.direction || "").toUpperCase();
  const direction=
    directionRaw==="BUY" || directionRaw==="LONG" ? "BUY" :
    directionRaw==="SELL" || directionRaw==="SHORT" ? "SELL" : "";
  if(!direction) return;
  setBought(false);
  setPurchaseDefaults({
    symbol:String(recommendation.symbol || "").replace(/_/g,""),
    side:direction==="SELL" ? "SHORT" : "LONG",
    entryPrice:Number(recommendation.entry) || 0,
    stopLoss:Number(recommendation.stopLoss) || 0,
    takeProfit:Number(recommendation.takeProfit) || 0,
    holdTimeMinMinutes:Number(recommendation.holdTimeMinMinutes) || 0,
    holdTimeMaxMinutes:Number(recommendation.holdTimeMaxMinutes) || 0,
    holdTimeReason:recommendation.holdTimeReason || "",
    marketType: recommendation.marketType || "PERP"
  });
  setManualPurchaseOpen(true);
};

const updateAiSetting=(key,value)=>{const next={...aiSettings,[key]:value};setAiSettings(next);localStorage.setItem('trademindmz-ai-settings',JSON.stringify(next));};const nav=[['dashboard','Dashboard',LayoutDashboard],['signals','AI Signals',BrainCircuit],['positions','Live Positions',Activity],['market','Market Overview',LineChart],['history','Signal History',History]];return <div className="app"><aside className={open?'side open':'side'}><div className="sidehead"><Logo/><button onClick={()=>setOpen(false)}><X/></button></div><div className="online"><i/> <div><b>AI ENGINE ONLINE</b><small>Learning from market history</small></div></div><nav>{nav.map(([id,label,I])=><button className={tab===id?'active':''} onClick={()=>{setTab(id);setOpen(false)}} key={id}><I/><span>{label}</span>{id==='positions'&&<em>{trackedPositions.filter(p=>p.status==='LIVE').length}</em>}</button>)}</nav><div className="bottom"><button><ShieldCheck/><span>Pionex Connection</span><i/></button><button onClick={()=>{setTab('settings');setOpen(false)}}><Settings/><span>Settings</span></button></div></aside>{open&&<div className="back" onClick={()=>setOpen(false)}/>}
<main><header><button className="hamb" onClick={()=>setOpen(true)}><Menu/></button><div className="mobilelogo"><Logo/></div><div className="title"><small>TRADEMINDMZ</small><b>{tab==='signals'?'AI Signals':tab==='positions'?'Live Positions':tab==='market'?'Market Overview':tab==='history'?'Signal History':tab==='settings'?'Settings':'Dashboard'}</b></div><div className="actions"><span className="live"><i/> AI LIVE</span><button className="bell"><Bell/></button><button className="avatar">MZ</button></div></header><section>
{tab==='signals'
  ? <SignalsErrorBoundary><Signals bought={bought} setBought={setBought} setManualPurchaseOpen={setManualPurchaseOpen} setPurchaseDefaults={setPurchaseDefaults}/></SignalsErrorBoundary>
  : tab==='positions'
    ? <Positions/>
    : tab==='settings'
      ? <SettingsPage settings={aiSettings} updateSetting={updateAiSetting}/>
      : tab==='dashboard'
        ? <ProDashboard onSelectTrade={handleDashboardTradeSelect}/>
        : tab==='market'
          ? <MarketOverview/>
          : tab==='history'
            ? <SignalHistory/>
            : <Dashboard/>
}
</section>

<ManualPurchaseModal
  open={manualPurchaseOpen}
  onClose={()=>setManualPurchaseOpen(false)}
  onSave={handleManualPurchase}
  initialValues={purchaseDefaults}
/>
</main></div>}


function LiveAiDashboardCard() {
  const {
    data,
    loading,
    refreshing,
    error,
    refresh,
  } = useLiveAiSignal({
    scanLimit: 100,
    maxMarkets: 25,
    preferredProvider: "groq",
  });

  const recommendation = data?.recommended ?? null;

  const formatNumber = (value, digits = 4) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return number.toLocaleString("en-US", {
      maximumFractionDigits: digits,
    });
  };

  const formatUpdated = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const verdict = data?.verdict ?? (
    recommendation ? "RECOMMENDED" : "NO_TRADE"
  );

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl">
      <div className="flex flex-col gap-4">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              Live AI Recommendation
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-white">
                Pionex Market → TOP 5 → Groq AI
              </h2>

              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/55">
                Read Only
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? "Scanning..." : "Refresh analysis"}
          </button>
        </div>

        {loading && !recommendation ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm text-white/55">
              Scanner Pionex markedet og sammenligner TOP 5...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-medium text-white">
              Live AI kunne ikke lastes.
            </div>

            <div className="mt-1 text-sm text-white/45">
              {error}
            </div>

            <button
              type="button"
              onClick={refresh}
              className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              Try again
            </button>
          </div>
        ) : recommendation ? (
          <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">

            <div className="rounded-xl border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">

                <div>
                  <div className="text-xs uppercase tracking-wider text-white/40">
                    Recommendation
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <div className="text-3xl font-bold text-white">
                      {recommendation.symbol}
                    </div>

                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-bold text-white">
                      {recommendation.direction}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider text-white/40">
                    Confidence
                  </div>

                  <div className="mt-1 text-3xl font-bold text-white">
                    {recommendation.confidence ?? "—"}%
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">

                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-white/35">
                    Score
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {recommendation.engineScore ?? recommendation.score ?? "—"}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-white/35">
                    Entry
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {formatNumber(recommendation.entry)}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-white/35">
                    Stop Loss
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {formatNumber(recommendation.stopLoss)}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-white/35">
                    Take Profit
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {formatNumber(recommendation.takeProfit)}
                  </div>
                </div>

              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-5">

              <div className="grid grid-cols-2 gap-3">

                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/35">
                    Risk / Reward
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {recommendation.riskReward ?? "—"} : 1
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/35">
                    Risk Level
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {recommendation.riskLevel ?? "—"}
                  </div>
                </div>

              </div>

              <div className="mt-5">
                <div className="text-[10px] uppercase tracking-wider text-white/35">
                  AI reasoning
                </div>

                <p className="mt-2 text-sm leading-6 text-white/65">
                  {recommendation.reasoning || "No reasoning returned."}
                </p>
              </div>

              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/35">
                <span>
                  Provider: <strong className="text-white/55">Groq</strong>
                </span>

                <span>
                  Updated:{" "}
                  <strong className="text-white/55">
                    {formatUpdated(data?.updatedAt)}
                  </strong>
                </span>

                <span>
                  {verdict}
                </span>
              </div>

            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/20 p-5">

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-semibold text-white">
                  NO TRADE
                </div>

                <div className="mt-1 text-sm text-white/45">
                  Ingen kandidat oppfylte alle TradeMindMZ-kriteriene.
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/55">
                Criteria enforced
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.criteria?.checks || []).map(check => (
                <div
                  key={check.key}
                  className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-white/45">
                      {check.label}
                    </span>

                    <span
                      className={
                        check.passed
                          ? "text-xs font-semibold text-emerald-400"
                          : "text-xs font-semibold text-red-400"
                      }
                    >
                      {check.passed ? "PASS" : "FAIL"}
                    </span>
                  </div>

                  <div className="mt-1 text-sm font-semibold text-white">
                    {String(check.actual ?? "—")}
                  </div>

                  <div className="mt-1 text-[11px] text-white/35">
                    Required: {String(check.target ?? "—")}
                  </div>
                </div>
              ))}
            </div>

            {data?.criteria?.failedChecks?.length ? (
              <div className="mt-5 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-red-400">
                  Why NO TRADE?
                </div>

                <div className="mt-2 text-sm text-white/65">
                  {data?.criteria?.bestCandidate?.symbol
                    ? `Beste kandidat: ${data.criteria.bestCandidate.symbol}`
                    : "Ingen kandidat tilgjengelig."}
                </div>

                {data?.criteria?.evaluatedCandidate && (
                  <div className="mt-2 text-xs text-white/35">
                    Evaluated candidate:{" "}
                    <span className="text-white/60">
                      {data.criteria.evaluatedCandidate}
                    </span>
                  </div>
                )}
              </div>
            ) : null}

          </div>
        )}

      </div>
    </section>
  );
}



function LivePionexBalance(){

  const [data,setData] = useState(null);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [error,setError] = useState("");

  const loadWallet = async () => {
    setRefreshing(true);
    setError("");

    try {

      const response = await fetch(apiUrl("/api/pionex/wallet-balances")
      );

      if (!response.ok) {
        throw new Error(
          `Wallet request failed (${response.status})`
        );
      }

      const result = await response.json();

      if (!result?.success) {
        throw new Error(
          result?.error ||
          "Unable to load Pionex wallet."
        );
      }

      setData(result);

    } catch (err) {

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load Pionex wallet."
      );

    } finally {

      setLoading(false);
      setRefreshing(false);

    }
  };

  useEffect(() => {

    loadWallet();

    const timer = setInterval(
      loadWallet,
      60000
    );

    return () =>
      clearInterval(timer);

  }, []);

  const total =
    Number(
      data?.data?.totalInUsdt
    );

  const spot =
    Number(
      data?.data?.botAccount?.totalInUsdt
    );

  const futures =
    Number(
      data?.data?.traderAccount?.totalInUsdt
    );

  const formatUsdt = (value) => {

    if (!Number.isFinite(value)) {
      return "—";
    }

    return value.toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    );

  };

  return (
    <div className="panel">

      <div className="head">

        <div className="pair">

          <div className="coin">
            <Wallet/>
          </div>

          <div>
            <b>
              PIONEX LIVE BALANCE
            </b>

            <small>
              Wallet
            </small>
          </div>

        </div>

        <span className="long">

          <Radio/>

          {refreshing
            ? "UPDATING"
            : "LIVE"}

        </span>

      </div>


      <div className="levels">

        <div>
          <small>
            TOTAL
          </small>

          <b>
            {loading
              ? "..."
              : `${formatUsdt(total)} USDT`}
          </b>
        </div>


        <div>
          <small>
            SPOT / BOT
          </small>

          <b>
            {loading
              ? "..."
              : `${formatUsdt(spot)} USDT`}
          </b>
        </div>


        <div>
          <small>
            USDT-M FUTURES
          </small>

          <b>
            {loading
              ? "..."
              : `${formatUsdt(futures)} USDT`}
          </b>
        </div>

      </div>


      <div className="meta">

        <span>

          <Radio/>

          Pionex

          <b>
            READ ONLY
          </b>

        </span>


        <span>

          <RefreshCw
            className={
              refreshing
                ? "spin"
                : ""
            }
          />

          {data?.updatedAt
            ? new Date(
                data.updatedAt
              ).toLocaleTimeString()
            : error
              ? "Connection error"
              : "Loading..."}

        </span>

      </div>


      {error && (
        <p
          style={{
            marginTop: "12px",
            color: "#ff8a8a"
          }}
        >
          {error}
        </p>
      )}

    </div>
  );
}


function TopFiveCommandCenter() {

  const {
    data,
    loading,
    refreshing,
    error,
    refresh,
  } = useLiveAiSignal({
    scanLimit: 100,
    maxMarkets: 25,
    preferredProvider: "groq",
  });

  const rawCandidates =
    data?.candidates ??
    data?.topCandidates ??
    data?.top5 ??
    data?.markets ??
    [];

  const candidates = Array.isArray(rawCandidates)
    ? rawCandidates
        .map((item, index) => ({
          ...item,
          __rank: index + 1,
        }))
        .sort((a, b) => {
          const sa = Number(
            a.engineScore ??
            a.score ??
            a.aiScore ??
            a.signalScore ??
            0
          );

          const sb = Number(
            b.engineScore ??
            b.score ??
            b.aiScore ??
            b.signalScore ??
            0
          );

          return sb - sa;
        })
        .slice(0, 5)
    : [];

  const number = (value, digits = 2) => {
    const n = Number(value);

    if (!Number.isFinite(n)) {
      return "—";
    }

    return n.toLocaleString("en-US", {
      maximumFractionDigits: digits,
    });
  };

  const percent = (value) => {
    const n = Number(value);

    if (!Number.isFinite(n)) {
      return "—";
    }

    return `${number(n, 1)}%`;
  };

  const candidateScore = (item) =>
    Number(
      item.engineScore ??
      item.score ??
      item.aiScore ??
      item.signalScore ??
      0
    );

  const candidateConfidence = (item) =>
    Number(
      item.confidence ??
      item.aiConfidence ??
      0
    );

  const candidateRR = (item) =>
    Number(
      item.riskReward ??
      item.rr ??
      item.risk_reward ??
      0
    );

  const candidateRSI = (item) =>
    Number(
      item.rsi ??
      item.RSI ??
      item.rsi14 ??
      0
    );

  const candidateVolume = (item) =>
    Number(
      item.volumeRatio ??
      item.volume_ratio ??
      item.volume ??
      0
    );

  const getDecision = (item) => {
    const score = candidateScore(item);
    const confidence = candidateConfidence(item);
    const rr = candidateRR(item);

    if (
      score >= 85 &&
      confidence >= 90 &&
      rr >= 2
    ) {
      return {
        label: "TRADE",
        className: "tm42-trade",
      };
    }

    if (
      score >= 75 &&
      confidence >= 80 &&
      rr >= 2
    ) {
      return {
        label: "WATCH",
        className: "tm42-watch",
      };
    }

    return {
      label: "NO TRADE",
      className: "tm42-no-trade",
    };
  };

  const getTrend = (item) =>
    String(
      item.trend ??
      item.direction ??
      item.bias ??
      "NEUTRAL"
    ).toUpperCase();

  return (
    <div className="tm42-top5">

      <div className="tm42-topbar">

        <div>
          <div className="tm42-eyebrow">
            MARKET INTELLIGENCE
          </div>

          <div className="tm42-title-row">
            <h2>
              TOP 5 OPPORTUNITIES
            </h2>

            <span className="tm42-live-pill">
              <i />
              LIVE
            </span>
          </div>

          <p>
            Pionex scanner → local scoring → AI comparison
          </p>
        </div>

        <button
          type="button"
          className="tm42-refresh"
          onClick={refresh}
          disabled={refreshing}
        >
          <RefreshCw
            size={15}
            className={refreshing ? "tm42-spin" : ""}
          />

          {refreshing
            ? "SCANNING..."
            : "REFRESH TOP 5"}
        </button>

      </div>

      {loading && !candidates.length ? (
        <div className="tm42-loading">
          <div className="tm42-loader-line" />
          <div>
            <strong>
              Scanning Pionex markets...
            </strong>

            <span>
              Building the best five candidates.
            </span>
          </div>
        </div>
      ) : error ? (
        <div className="tm42-error">

          <div>
            <strong>
              TOP 5 unavailable
            </strong>

            <span>
              {error}
            </span>
          </div>

          <button
            type="button"
            onClick={refresh}
            className="tm42-small-btn"
          >
            Retry
          </button>

        </div>
      ) : candidates.length ? (

        <div className="tm42-list">

          {candidates.map((item, index) => {

            const symbol =
              item.symbol ??
              item.market ??
              item.pair ??
              "UNKNOWN";

            const score =
              candidateScore(item);

            const confidence =
              candidateConfidence(item);

            const rr =
              candidateRR(item);

            const rsi =
              candidateRSI(item);

            const volume =
              candidateVolume(item);

            const decision =
              getDecision(item);

            const trend =
              getTrend(item);

            const best =
              index === 0;

            return (
              <div
                className={
                  best
                    ? "tm42-row tm42-best"
                    : "tm42-row"
                }
                key={`${symbol}-${index}`}
              >

                <div className="tm42-rank">
                  <span>
                    #{index + 1}
                  </span>

                  {best && (
                    <small>
                      BEST
                    </small>
                  )}
                </div>

                <div className="tm42-symbol">
                  <strong>
                    {symbol}
                  </strong>

                  <span>
                    {trend}
                  </span>
                </div>

                <div className="tm42-metric">
                  <small>
                    SCORE
                  </small>

                  <strong>
                    {number(score, 0)}
                  </strong>
                </div>

                <div className="tm42-metric">
                  <small>
                    CONF
                  </small>

                  <strong>
                    {percent(confidence)}
                  </strong>
                </div>

                <div className="tm42-metric tm42-hide-mobile">
                  <small>
                    RSI
                  </small>

                  <strong>
                    {number(rsi, 1)}
                  </strong>
                </div>

                <div className="tm42-metric tm42-hide-mobile">
                  <small>
                    RR
                  </small>

                  <strong>
                    {rr > 0
                      ? `${number(rr, 1)} : 1`
                      : "—"}
                  </strong>
                </div>

                <div className="tm42-metric tm42-hide-mobile">
                  <small>
                    VOL
                  </small>

                  <strong>
                    {volume > 0
                      ? `${number(volume, 2)}x`
                      : "—"}
                  </strong>
                </div>

                <div className="tm42-decision">
                  <span className={decision.className}>
                    {decision.label}
                  </span>
                </div>

              </div>
            );
          })}

        </div>

      ) : (

        <div className="tm42-empty">

          <div className="tm42-empty-icon">
            <Target size={20} />
          </div>

          <div>
            <strong>
              NO QUALIFIED OPPORTUNITIES
            </strong>

            <span>
              Scanneren fant ingen kandidater som
              tilfredsstiller TradeMindMZ-kriteriene.
            </span>
          </div>

        </div>

      )}

      <div className="tm42-footer">

        <span>
          {candidates.length
            ? `${candidates.length} candidates ranked`
            : "Waiting for market data"}
        </span>

        <span>
          AI does not execute trades
        </span>

      </div>

    </div>
  );
}



function MarketRegimeRiskCenter() {

  const {
    data,
    loading,
    refreshing,
    error,
    refresh,
  } = useLiveAiSignal({
    scanLimit: 100,
    maxMarkets: 25,
    preferredProvider: "groq",
  });

  const rawCandidates =
    data?.candidates ??
    data?.topCandidates ??
    data?.top5 ??
    data?.markets ??
    [];

  const candidates = Array.isArray(rawCandidates)
    ? rawCandidates.slice(0, 5)
    : [];

  const number = (value) => {
    const n = Number(value);

    if (!Number.isFinite(n)) {
      return null;
    }

    return n;
  };

  const scoreOf = (item) =>
    number(
      item?.score ??
      item?.aiScore ??
      item?.signalScore
    ) ?? 0;

  const confidenceOf = (item) =>
    number(
      item?.confidence ??
      item?.aiConfidence
    ) ?? 0;

  const rsiOf = (item) =>
    number(
      item?.rsi ??
      item?.RSI ??
      item?.rsi14
    );

  const rrOf = (item) =>
    number(
      item?.riskReward ??
      item?.rr ??
      item?.risk_reward
    ) ?? 0;

  const trendOf = (item) =>
    String(
      item?.trend ??
      item?.direction ??
      item?.bias ??
      "NEUTRAL"
    ).toUpperCase();

  const bullish = candidates.filter(item => {
    const trend = trendOf(item);

    return (
      trend.includes("BULL") ||
      trend === "LONG" ||
      trend === "BUY" ||
      trend === "UP"
    );
  }).length;

  const bearish = candidates.filter(item => {
    const trend = trendOf(item);

    return (
      trend.includes("BEAR") ||
      trend === "SHORT" ||
      trend === "SELL" ||
      trend === "DOWN"
    );
  }).length;

  const neutral =
    Math.max(
      candidates.length - bullish - bearish,
      0
    );

  const breadth =
    candidates.length
      ? Math.round(
          (
            (bullish - bearish) /
            candidates.length
          ) * 100
        )
      : 0;

  const avgScore =
    candidates.length
      ? Math.round(
          candidates.reduce(
            (sum, item) => sum + scoreOf(item),
            0
          ) / candidates.length
        )
      : 0;

  const avgConfidence =
    candidates.length
      ? Math.round(
          candidates.reduce(
            (sum, item) => sum + confidenceOf(item),
            0
          ) / candidates.length
        )
      : 0;

  const rsiValues =
    candidates
      .map(rsiOf)
      .filter(value => value !== null);

  const avgRsi =
    rsiValues.length
      ? (
          rsiValues.reduce(
            (sum, value) => sum + value,
            0
          ) / rsiValues.length
        )
      : null;

  const rrValues =
    candidates
      .map(rrOf)
      .filter(value => value > 0);

  const avgRR =
    rrValues.length
      ? (
          rrValues.reduce(
            (sum, value) => sum + value,
            0
          ) / rrValues.length
        )
      : null;

  let regime = "NEUTRAL";
  let regimeClass = "neutral";

  if (
    candidates.length >= 3 &&
    bullish > bearish &&
    breadth >= 20
  ) {
    regime = "BULLISH";
    regimeClass = "bullish";
  }

  if (
    candidates.length >= 3 &&
    bearish > bullish &&
    breadth <= -20
  ) {
    regime = "BEARISH";
    regimeClass = "bearish";
  }

  const extremeRsi =
    avgRsi !== null &&
    (avgRsi >= 72 || avgRsi <= 28);

  let risk = "MEDIUM";
  let riskClass = "medium";

  if (
    extremeRsi ||
    avgScore < 60 ||
    avgConfidence < 65 ||
    candidates.length < 3
  ) {
    risk = "HIGH";
    riskClass = "high";
  } else if (
    avgScore >= 80 &&
    avgConfidence >= 82 &&
    (avgRR === null || avgRR >= 2)
  ) {
    risk = "LOW";
    riskClass = "low";
  }

  const tradeQuality =
    avgScore >= 85 &&
    avgConfidence >= 90 &&
    (avgRR === null || avgRR >= 2);

  const marketBreadthLabel =
    breadth >= 30
      ? "Positive"
      : breadth <= -30
        ? "Negative"
        : "Mixed";

  const decision =
    risk === "HIGH"
      ? "DEFENSIVE"
      : regime === "BULLISH" && tradeQuality
        ? "SELECTIVE LONG"
        : regime === "BEARISH" && tradeQuality
          ? "SELECTIVE SHORT"
          : "WAIT / SELECT";

  const format = (value, digits = 0) => {
    if (!Number.isFinite(Number(value))) {
      return "—";
    }

    return Number(value).toLocaleString(
      "en-US",
      {
        maximumFractionDigits: digits,
      }
    );
  };

  return (
    <section className="tm43-regime">

      <div className="tm43-head">

        <div>
          <div className="tm43-eyebrow">
            MARKET REGIME ENGINE
          </div>

          <div className="tm43-heading">
            <h2>
              MARKET REGIME & RISK
            </h2>

            <span className="tm43-readonly">
              READ ONLY
            </span>
          </div>

          <p>
            Samlet vurdering fra live TOP 5-marked,
            signalstyrke, confidence, RSI og risk/reward.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="tm43-refresh"
        >
          <RefreshCw
            size={14}
            className={refreshing ? "tm43-spin" : ""}
          />

          {refreshing
            ? "UPDATING..."
            : "UPDATE REGIME"}
        </button>

      </div>

      {loading && !candidates.length ? (

        <div className="tm43-loading">
          <div className="tm43-loader" />
          <span>
            Calculating market regime...
          </span>
        </div>

      ) : error ? (

        <div className="tm43-error">
          <strong>
            Regime data unavailable
          </strong>

          <span>
            {error}
          </span>
        </div>

      ) : (

        <div className="tm43-grid">

          <div
            className={
              `tm43-regime-card ${regimeClass}`
            }
          >
            <span className="tm43-label">
              MARKET REGIME
            </span>

            <strong>
              {regime}
            </strong>

            <small>
              Breadth: {marketBreadthLabel}
            </small>
          </div>

          <div
            className={
              `tm43-risk-card ${riskClass}`
            }
          >
            <span className="tm43-label">
              RISK LEVEL
            </span>

            <strong>
              {risk}
            </strong>

            <small>
              Decision: {decision}
            </small>
          </div>

          <div className="tm43-stat">
            <span className="tm43-label">
              MARKET BREADTH
            </span>

            <strong>
              {breadth > 0 ? "+" : ""}
              {breadth}%
            </strong>

            <div className="tm43-bar">
              <i
                style={{
                  width: `${Math.min(
                    Math.abs(breadth),
                    100
                  )}%`,
                }}
              />
            </div>

            <small>
              BULL {bullish} · NEUTRAL {neutral} · BEAR {bearish}
            </small>
          </div>

          <div className="tm43-stat">
            <span className="tm43-label">
              AVG SCORE
            </span>

            <strong>
              {format(avgScore)}
            </strong>

            <small>
              TOP 5 candidates
            </small>
          </div>

          <div className="tm43-stat">
            <span className="tm43-label">
              AI CONFIDENCE
            </span>

            <strong>
              {avgConfidence > 0
                ? `${format(avgConfidence)}%`
                : "—"}
            </strong>

            <small>
              Aggregate confidence
            </small>
          </div>

          <div className="tm43-stat">
            <span className="tm43-label">
              AVG RSI
            </span>

            <strong>
              {avgRsi !== null
                ? format(avgRsi, 1)
                : "—"}
            </strong>

            <small>
              {extremeRsi
                ? "Extreme zone"
                : "Normal zone"}
            </small>
          </div>

          <div className="tm43-stat">
            <span className="tm43-label">
              AVG RISK / REWARD
            </span>

            <strong>
              {avgRR !== null
                ? `${format(avgRR, 1)} : 1`
                : "—"}
            </strong>

            <small>
              Across qualified candidates
            </small>
          </div>

          <div className="tm43-decision">

            <div>
              <span className="tm43-label">
                CURRENT AI POSTURE
              </span>

              <strong>
                {decision}
              </strong>

              <small>
                {risk === "HIGH"
                  ? "Risk filters are dominating the current setup."
                  : regime === "BULLISH"
                    ? "Momentum is stronger on the upside."
                    : regime === "BEARISH"
                      ? "Momentum is stronger on the downside."
                      : "No dominant market direction detected."}
              </small>
            </div>

            <div className="tm43-pulse">
              <i />
              LIVE
            </div>

          </div>

        </div>

      )}

      <div className="tm43-footer">
        <span>
          {candidates.length}
          {" "}markets evaluated
        </span>

        <span>
          AI recommendation only — no automatic execution
        </span>
      </div>

    </section>
  );
}


function Dashboard(){

  const [data,setData] = useState(null);
  const [wallet,setWallet] = useState(null);
  const [markets,setMarkets] = useState([]);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [error,setError] = useState("");

  const loadDashboard = async () => {

    setRefreshing(true);
    setError("");

    try {

      const [
        dashboardResponse,
        walletResponse,
        marketResponse
      ] = await Promise.all([
        fetchDashboardData(),

        fetch(apiUrl("/api/pionex/wallet-balances"))
        .then(async response => {
          if (!response.ok) {
            throw new Error(
              `Wallet request failed (${response.status})`
            );
          }

          return response.json();
        }),

        fetch(apiUrl("/api/pionex/market-scan?limit=100&maxMarkets=5"))
        .then(async response => {
          if (!response.ok) {
            throw new Error(
              `Market scan failed (${response.status})`
            );
          }

          return response.json();
        })
      ]);

      setData(dashboardResponse);

      if (!walletResponse?.success) {
        throw new Error(
          walletResponse?.error ||
          "Unable to load Pionex wallet."
        );
      }

      setWallet(walletResponse);

      setMarkets(
        Array.isArray(
          marketResponse?.candidates
        )
          ? marketResponse.candidates.slice(0,5)
          : []
      );

    } catch (err) {

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load dashboard."
      );

    } finally {

      setLoading(false);
      setRefreshing(false);

    }
  };


  useEffect(() => {

    loadDashboard();

    const timer = setInterval(
      loadDashboard,
      60000
    );

    return () =>
      clearInterval(timer);

  }, []);


  const learning =
    data?.learning || {};


  const positions =
    Array.isArray(
      data?.positions?.positions
    )
      ? data.positions.positions
      : [];


  const history =
    Array.isArray(
      data?.history?.history
    )
      ? data.history.history
      : [];


  const latest =
    learning?.latest ||
    history?.[0] ||
    null;


  const walletData =
    wallet?.data || {};


  const total =
    Number(
      walletData?.totalInUsdt
    );


  const spot =
    Number(
      walletData?.botAccount?.totalInUsdt
    );


  const futures =
    Number(
      walletData?.traderAccount?.totalInUsdt
    );


  const formatUsdt = value => {

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return number.toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    );
  };


  const formatPercent = value => {

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
  };


  const readValue = (
    object,
    keys,
    fallback = null
  ) => {

    for (const key of keys) {

      if (
        object &&
        object[key] !== undefined &&
        object[key] !== null
      ) {
        return object[key];
      }

    }

    return fallback;
  };


  const recommendation =
    readValue(
      latest,
      [
        "recommendation",
        "signal",
        "action"
      ],
      "WATCH"
    );


  const recommendationText =
    String(
      recommendation || "WATCH"
    ).replace(
      /_/g,
      " "
    );


  const confidence =
    Number(
      readValue(
        latest,
        [
          "confidence",
          "score"
        ],
        learning?.averageConfidence
      )
    );


  const averageConfidence =
    Number(
      learning?.averageConfidence
    ) || 0;


  const latestSymbol =
    readValue(
      latest,
      [
        "symbol",
        "market",
        "pair",
        "ticker"
      ],
      markets?.[0]?.symbol || "MARKET"
    );


  const openPositionCount =
    positions.length;


  const topMarkets =
    markets.map(market => ({

      symbol:
        readValue(
          market,
          ["symbol","market"],
          "—"
        ),

      price:
        readValue(
          market,
          ["price","close"],
          null
        ),

      change:
        readValue(
          market,
          [
            "change24h",
            "change24hPercent",
            "priceChangePercent",
            "change"
          ],
          null
        ),

      score:
        readValue(
          market,
          [
            "score",
            "aiScore",
            "technicalScore",
            "signalScore"
          ],
          null
        ),

      rsi:
        readValue(
          market,
          [
            "rsi",
            "RSI",
            "rsiValue",
            "relativeStrengthIndex"
          ],
          null
        ),

      volume:
        readValue(
          market,
          [
            "volumeRatio",
            "volume",
            "volume_ratio"
          ],
          null
        ),

      trend:
        readValue(
          market,
          ["trend","direction"],
          "—"
        )

    }));


  return (
    <>
      <div className="hero-row">

        <div>

          <div className="eyebrow">
            LIVE MARKET COMMAND CENTER
          </div>

          <h2>
            See the market.<br />
            <span>Know the signal.</span>
          </h2>

          <p>
            TradeMindMZ scans Pionex,
            ranks the strongest setups and
            compares the live market data
            with AI intelligence.
          </p>

        </div>

        <button
          className="refresh-btn"
          onClick={loadDashboard}
          disabled={refreshing}
        >

          <RefreshCw
            className={
              refreshing
                ? "spin"
                : ""
            }
          />

          {refreshing
            ? "Refreshing..."
            : "Refresh dashboard"}

        </button>

      </div>


      {error && (
        <div
          className="card"
          style={{
            marginBottom:"16px",
            borderColor:"rgba(255,97,120,.35)"
          }}
        >

          <div className="section-label">

            <span className="label-icon red">
              !
            </span>

            <div>
              <small>
                SYSTEM WARNING
              </small>

              <strong>
                {error}
              </strong>
            </div>

          </div>

        </div>
      )}


      <div className="grid">

        <section className="card span-7">

          <div className="card-head">

            <div className="section-label">

              <span className="label-icon cyan">
                ◈
              </span>

              <div>
                <small>
                  AI ENGINE
                </small>

                <strong>
                  Decision Intelligence
                </strong>
              </div>

            </div>

            <div className="state success">
              <i />
              ONLINE
            </div>

          </div>


          <div className="ai-main">

            <div className="score-ring">

              <div className="ring-inner">

                <b>
                  {Math.round(
                    averageConfidence
                  )}
                </b>

                <small>
                  AI SCORE
                </small>

              </div>

            </div>


            <div className="ai-copy">

              <div className="mini-label">
                CURRENT RECOMMENDATION
              </div>

              <div className="signal-title">

                <strong>
                  {String(
                    latestSymbol
                  ).replace(
                    "_USDT",
                    " / USDT"
                  )}
                </strong>

                <span
                  className={
                    recommendationText === "BUY"
                      ? "buy"
                      : recommendationText === "HOLD"
                        ? "hold"
                        : "watch"
                  }
                >
                  {recommendationText}
                </span>

              </div>

              <p>
                {latest
                  ? `Latest AI recommendation:
                     ${recommendationText}.
                     TradeMindMZ continues to
                     evaluate market conditions
                     before any manual execution.`
                  : "Waiting for the latest AI analysis."}
              </p>


              <div className="progress">

                <span
                  style={{
                    width:
                      `${Math.max(
                        0,
                        Math.min(
                          100,
                          averageConfidence
                        )
                      )}%`
                  }}
                />

              </div>


              <div className="meta-line">

                <span>
                  Confidence{" "}
                  <b>
                    {Number.isFinite(confidence)
                      ? `${confidence}%`
                      : "—"}
                  </b>
                </span>

                <span>
                  Provider{" "}
                  <b>
                    GROQ
                  </b>
                </span>

                <span>
                  Mode{" "}
                  <b>
                    READ ONLY
                  </b>
                </span>

              </div>

            </div>

          </div>


          <div
            className="levels"
            style={{marginTop:"20px"}}
          >

            {[
              [
                "AI ANALYSES",
                learning?.totalAnalyses ?? "—"
              ],

              [
                "WATCH",
                learning?.recommendations?.WATCH ?? 0
              ],

              [
                "HOLD",
                learning?.recommendations?.HOLD ?? 0
              ],

              [
                "POSITIONS",
                openPositionCount
              ]

            ].map(item => (

              <div key={item[0]}>

                <small>
                  {item[0]}
                </small>

                <b>
                  {item[1]}
                </b>

              </div>

            ))}

          </div>

        </section>


        <section className="card span-5">

          <div className="card-head">

            <div className="section-label">

              <span className="label-icon violet">
                ◫
              </span>

              <div>

                <small>
                  PIONEX
                </small>

                <strong>
                  Live Balance
                </strong>

              </div>

            </div>

            <div className="state success">
              <i />
              LIVE
            </div>

          </div>


          <div className="wallet-total">

            <small>
              TOTAL ACCOUNT VALUE
            </small>

            <strong>
              {loading
                ? "..."
                : `${formatUsdt(total)} `}
              <em>
                USDT
              </em>
            </strong>

            <span>
              {wallet?.updatedAt
                ? `Updated ${
                    new Date(
                      wallet.updatedAt
                    ).toLocaleTimeString()
                  }`
                : "Waiting for live data"}
            </span>

          </div>


          <div className="balance-split">

            <div>

              <small>
                SPOT / BOT
              </small>

              <strong>
                {loading
                  ? "..."
                  : formatUsdt(spot)}
                <em>
                  {" "}USDT
                </em>
              </strong>

            </div>


            <div>

              <small>
                USDT-M FUTURES
              </small>

              <strong>
                {loading
                  ? "..."
                  : formatUsdt(futures)}
                <em>
                  {" "}USDT
                </em>
              </strong>

            </div>

          </div>


          <div className="wallet-bar">

            <span
              style={{
                width:
                  total > 0
                    ? `${Math.max(
                        0,
                        Math.min(
                          100,
                          (spot / total) * 100
                        )
                      )}%`
                    : "0%"
              }}
            />

            <span
              style={{
                width:
                  total > 0
                    ? `${Math.max(
                        0,
                        Math.min(
                          100,
                          (futures / total) * 100
                        )
                      )}%`
                    : "0%"
              }}
            />

          </div>


          <div className="legend">

            <span>
              <i className="spot" />
              Spot / Bot
            </span>

            <span>
              <i className="futures" />
              USDT-M Futures
            </span>

          </div>

        </section>


        <section className="card span-7">

          <div className="card-head">

            <div className="section-label">

              <span className="label-icon green">
                ⌁
              </span>

              <div>

                <small>
                  MARKET PULSE
                </small>

                <strong>
                  Pionex TOP 5
                </strong>

              </div>

            </div>

            <button
              className="text-btn"
              onClick={() =>
                setTab?.("market")
              }
            >
              Live scan →
            </button>

          </div>


          <div className="table">

            <div className="thead">

              <span>MARKET</span>
              <span>24H</span>
              <span>SCORE</span>
              <span>RSI</span>
              <span>STATUS</span>

            </div>


            {topMarkets.length === 0 ? (

              <div
                style={{
                  padding:"22px 2px",
                  color:"#697483",
                  fontSize:"11px"
                }}
              >
                Loading live Pionex market data...
              </div>

            ) : (

              topMarkets.map((market,index) => {

                const numericScore =
                  Number(market.score);

                const score =
                  Number.isFinite(
                    numericScore
                  )
                    ? numericScore
                    : null;

                const numericRsi =
                  Number(market.rsi);

                const change =
                  Number(market.change);

                const symbol =
                  String(
                    market.symbol
                  ).replace(
                    "_USDT",
                    " / USDT"
                  );


                const status =
                  score !== null
                    ? score >= 85
                      ? "BUY"
                      : score >= 75
                        ? "WATCH"
                        : "FILTERED"
                    : "WATCH";


                return (

                  <div
                    className="tr"
                    key={
                      `${market.symbol}-${index}`
                    }
                  >

                    <strong>
                      {symbol}
                    </strong>

                    <span
                      className={
                        Number.isFinite(change)
                          ? change >= 0
                            ? "up"
                            : "down"
                          : ""
                      }
                    >
                      {Number.isFinite(change)
                        ? formatPercent(change)
                        : "—"}
                    </span>

                    <b>
                      {score ?? "—"}
                    </b>

                    <span>
                      {Number.isFinite(
                        numericRsi
                      )
                        ? numericRsi.toFixed(1)
                        : "—"}
                    </span>

                    <em
                      className={
                        status === "BUY"
                          ? "buy"
                          : status === "WATCH"
                            ? "watch"
                            : "blocked"
                      }
                    >
                      {status}
                    </em>

                  </div>

                );

              })

            )}

          </div>

        </section>


        <section className="card span-5">

          <div className="card-head">

            <div className="section-label">

              <span className="label-icon orange">
                ◉
              </span>

              <div>

                <small>
                  RISK MONITOR
                </small>

                <strong>
                  Trading Rules
                </strong>

              </div>

            </div>

            <div className="state neutral">
              SAFE MODE
            </div>

          </div>


          {[
            ["Minimum AI score","75","PASS"],
            ["Minimum confidence","80%","PASS"],
            ["Minimum risk / reward","2.0","PASS"],
            ["RSI range","35–70","CHECK"]

          ].map(
            ([label,value,status]) => (

              <div
                className="rule"
                key={label}
              >

                <div>

                  <span>
                    {label}
                  </span>

                  <b>
                    {value}
                  </b>

                </div>

                <div
                  className={
                    status === "PASS"
                      ? "ok"
                      : "warn"
                  }
                >
                  {status}
                </div>

              </div>

            )
          )}


          <div className="safety-note">

            Automatic Pionex order execution
            is disabled. Manual confirmation
            remains required.

          </div>

        </section>


        <section className="card span-8">

          <div className="card-head">

            <div className="section-label">

              <span className="label-icon red">
                ◉
              </span>

              <div>

                <small>
                  LIVE POSITIONS
                </small>

                <strong>
                  Open exposure
                </strong>

              </div>

            </div>

            <button
              className="text-btn"
              onClick={() =>
                window.dispatchEvent(
                  new Event(
                    "trademindmz-position-updated"
                  )
                )
              }
            >
              Refresh →
            </button>

          </div>


          {positions.length === 0 ? (

            <div
              style={{
                padding:"18px 0",
                color:"#697483",
                fontSize:"11px"
              }}
            >
              No open Pionex positions reported.
            </div>

          ) : (

            positions.slice(0,5).map(
              (position,index) => {

                const symbol =
                  String(
                    readValue(
                      position,
                      [
                        "symbol",
                        "market"
                      ],
                      "—"
                    )
                  ).replace(
                    "_USDT",
                    " / USDT"
                  );


                const side =
                  readValue(
                    position,
                    [
                      "side",
                      "direction"
                    ],
                    "LIVE"
                  );


                const pnl =
                  Number(
                    readValue(
                      position,
                      [
                        "pnlPercent",
                        "pnl",
                        "unrealizedPnlPercent"
                      ],
                      null
                    )
                  );


                return (

                  <div
                    className="position-row"
                    key={`${symbol}-${index}`}
                  >

                    <div className="coin-badge">
                      {symbol.charAt(0)}
                    </div>

                    <div className="pos-main">

                      <strong>
                        {symbol}
                      </strong>

                      <small>
                        {String(side).toUpperCase()}
                      </small>

                    </div>


                    <div>

                      <small>
                        PnL
                      </small>

                      <strong
                        className={
                          Number.isFinite(pnl)
                            ? pnl >= 0
                              ? "up"
                              : "down"
                            : ""
                        }
                      >
                        {Number.isFinite(pnl)
                          ? formatPercent(pnl)
                          : "—"}
                      </strong>

                    </div>


                    <div>

                      <small>
                        STATUS
                      </small>

                      <strong>
                        LIVE
                      </strong>

                    </div>


                    <em className="buy">
                      LIVE
                    </em>

                  </div>

                );

              }
            )

          )}

        </section>


        <section className="card span-4 activity-card">

          <div className="card-head">

            <div className="section-label">

              <span className="label-icon blue">
                ◷
              </span>

              <div>

                <small>
                  RECENT ACTIVITY
                </small>

                <strong>
                  System feed
                </strong>

              </div>

            </div>

          </div>


          {history.length === 0 ? (

            <div
              style={{
                padding:"18px 0",
                color:"#697483",
                fontSize:"11px"
              }}
            >
              No recent activity.
            </div>

          ) : (

            history.slice(0,3).map(
              (item,index) => {

                const symbol =
                  readValue(
                    item,
                    [
                      "symbol",
                      "market"
                    ],
                    "SYSTEM"
                  );


                const rec =
                  String(
                    readValue(
                      item,
                      [
                        "recommendation",
                        "signal",
                        "action"
                      ],
                      "WATCH"
                    )
                  ).replace(
                    /_/g,
                    " "
                  );


                return (

                  <div
                    className="activity"
                    key={`${symbol}-${index}`}
                  >

                    <i
                      className={
                        `dot ${
                          index === 0
                            ? "green"
                            : index === 1
                              ? "cyan"
                              : "amber"
                        }`
                      }
                    />

                    <div>

                      <strong>
                        {String(symbol).replace(
                          "_USDT",
                          " / USDT"
                        )}
                      </strong>

                      <small>
                        AI verdict: {rec}
                      </small>

                    </div>

                  </div>

                );

              }
            )

          )}

        </section>

      </div>

    </>
  );
}


function MarketOverview(){
  const [markets,setMarkets] = useState([]);
  const [updatedAt,setUpdatedAt] = useState(null);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [error,setError] = useState("");

  const loadMarkets = async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      /*
       * Market Overview is a viewer. It must never trigger its own
       * Pionex scan because the server already scans every 7 minutes.
       * Reading the persisted snapshot also means the data exists
       * when the Android app was closed.
       */
      const data = await fetchLatestAiSignal({
        interval: "15M",
        maxMarkets: 25,
        preferredProvider: "groq",
      });

      if (!data) {
        throw new Error(
          "No persisted server market snapshot is available yet."
        );
      }

      const candidates =
        Array.isArray(data.candidates)
          ? data.candidates
          : Array.isArray(data.engineTop5)
            ? data.engineTop5
            : [];

      setMarkets(candidates.slice(0, 5));
      setUpdatedAt(
        data.updatedAt ||
        data.persistedAt ||
        null
      );
    } catch (err) {
      /*
       * Keep the previous successful market table visible on
       * transient errors instead of replacing it with blanks.
       */
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load persisted market data."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMarkets();

    const timer = setInterval(
      () => loadMarkets(),
      60000
    );

    return () => clearInterval(timer);
  }, []);

  const formatPrice = value => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return new Intl.NumberFormat(
      "en-US",
      {
        maximumFractionDigits:
          number < 1 ? 6 : 2
      }
    ).format(number);
  };

  const formatPercent = value => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
  };

  const getTrend = market => {
    const ema9 = Number(
      market?.indicators?.ema9
    );
    const ema21 = Number(
      market?.indicators?.ema21
    );

    if (
      Number.isFinite(ema9) &&
      Number.isFinite(ema21)
    ) {
      if (ema9 > ema21) return "BULLISH";
      if (ema9 < ema21) return "BEARISH";
    }

    return "NEUTRAL";
  };

  return (
    <>
      <div className="hero">
        <div>
          <label>
            <LineChart />
            MARKET OVERVIEW
          </label>

          <h1>
            Live Pionex market intelligence.
          </h1>

          <p>
            Real-time market data, momentum,
            volume and technical conditions
            from Pionex.
          </p>
        </div>

        <button
          className="refresh"
          onClick={() => loadMarkets(true)}
          disabled={refreshing}
        >
          <RefreshCw
            className={
              refreshing ? "spin" : ""
            }
          />
          {refreshing
            ? " Refreshing..."
            : " Refresh markets"}
        </button>
      </div>

      {error && (
        <div className="panel" style={{padding:"24px"}}>
          <h3>
            <ShieldCheck />
            Unable to load market data
          </h3>
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="panel" style={{padding:"30px"}}>
          <p>
            Loading live Pionex market data...
          </p>
        </div>
      ) : markets.length === 0 ? (
        <div className="panel" style={{padding:"30px"}}>
          <p>
            No market data available.
          </p>
        </div>
      ) : (
        <div className="panel">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>MARKET</th>
                  <th>PRICE</th>
                  <th>24H</th>
                  <th>SCORE</th>
                  <th>RSI</th>
                  <th>VOLUME</th>
                  <th>TREND</th>
                </tr>
              </thead>

              <tbody>
                {markets.map((market) => {
                  const change =
                    Number(
                      market?.indicators?.change24h ??
                      market?.change24h
                    );

                  const rsi =
                    Number(
                      market?.indicators?.rsi14
                    );

                  const volume =
                    Number(
                      market?.indicators?.volumeRatio
                    );

                  const trend =
                    getTrend(market);

                  return (
                    <tr
                      key={market.symbol}
                    >
                      <td>
                        <strong>
                          {market.symbol}
                        </strong>
                      </td>

                      <td>
                        {formatPrice(
                          market.price ??
                          market.entry
                        )}
                      </td>

                      <td>
                        {formatPercent(change)}
                      </td>

                      <td>
                        {Number.isFinite(
                          Number(market.score)
                        )
                          ? market.score
                          : "—"}
                      </td>

                      <td>
                        {Number.isFinite(rsi)
                          ? rsi.toFixed(1)
                          : "—"}
                      </td>

                      <td>
                        {Number.isFinite(volume)
                          ? volume.toFixed(2) + "x"
                          : "—"}
                      </td>

                      <td>
                        {trend}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              padding:"14px 18px",
              fontSize:"12px",
              opacity:0.55
            }}
          >
            Showing {markets.length} latest server-scanned Pionex USDT-M markets ·
            server analysis every 7 minutes
            {updatedAt
              ? ` · Updated ${new Date(updatedAt).toLocaleTimeString("nb-NO")}`
              : ""}
          </div>
        </div>
      )}
    </>
  );
}

function SignalHistory(){

  const [history,setHistory] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [refreshing,setRefreshing] = useState(false);

  const loadHistory = async () => {
    setRefreshing(true);
    setError("");

    try {
      const result =
        await fetchSignalHistory(50);

      const signalHistory =
        Array.isArray(result?.history)
          ? result.history
          : [];

      /*
       * Signal History is reserved for actionable market signals.
       * Position AI has its own Live Positions view and must not
       * appear as HOLD/WATCH trading signals here.
       */
      setHistory(
        signalHistory.filter(item => {
          const recommendation = String(
            item?.recommendation ||
            item?.signal ||
            item?.action ||
            ""
          ).toUpperCase();

          const isSignal =
            String(item?.type || "SIGNAL").toUpperCase() !==
            "POSITION";

          return (
            isSignal &&
            (recommendation === "BUY" ||
             recommendation === "SELL" ||
             recommendation === "LONG" ||
             recommendation === "SHORT")
          );
        })
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load signal history."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadHistory();

    const timer = setInterval(
      loadHistory,
      60000
    );

    return () =>
      clearInterval(timer);
  }, []);

  const formatDate = value => {
    if (!value) return "—";

    const date =
      new Date(value);

    if (
      Number.isNaN(date.getTime())
    ) {
      return "—";
    }

    return date.toLocaleString(
      "en-GB",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }
    );
  };

  const formatPrice = value => {
    const number = Number(value);

    if (
      !Number.isFinite(number)
    ) {
      return "—";
    }

    return new Intl.NumberFormat(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6
      }
    ).format(number);
  };

  return <>
    <div className="hero">
      <div>
        <label>
          <History/> AI SIGNAL HISTORY
        </label>

        <h1>
          Real AI decisions, stored over time.
        </h1>

        <p>
          TradeMindMZ stores actionable BUY/SELL
          signal results in Supabase. Position risk
          analysis is shown under Live Positions.
        </p>
      </div>

      <button
        className="refresh"
        onClick={loadHistory}
        disabled={refreshing}
      >
        <RefreshCw
          className={
            refreshing ? "spin" : ""
          }
        />

        {refreshing
          ? " Refreshing..."
          : " Refresh history"}
      </button>
    </div>

    {error && (
      <div
        className="panel"
        style={{padding:"24px"}}
      >
        <h3>
          <ShieldCheck/>
          Unable to load history
        </h3>
        <p>{error}</p>
      </div>
    )}

    {loading ? (
      <div
        className="panel"
        style={{padding:"30px"}}
      >
        <div className="live-position-empty">
          <History size={28}/>
          <h3>
            Loading signal history...
          </h3>
          <p>
            Reading previous AI analysis.
          </p>
        </div>
      </div>
    ) : !history.length ? (
      <div
        className="panel"
        style={{padding:"30px"}}
      >
        <div className="live-position-empty">
          <History size={28}/>
          <h3>
            No history yet
          </h3>
          <p>
            AI analyses will appear here as
            TradeMindMZ processes signals
            and positions.
          </p>
        </div>
      </div>
    ) : (
      <div
        className="positions"
      >
        {history.map(item => {

          const recommendation =
            String(
              item.recommendation ||
              item.signal ||
              item.action ||
              ""
            ).toUpperCase()
              .replace(
                /LONG/g,
                "BUY"
              )
              .replace(
                /SHORT/g,
                "SELL"
              )
              .replace(
                /_/g,
                " "
              );

          const symbol =
            item.symbol
              ? String(item.symbol)
                  .replace(
                    "_USDT",
                    " / USDT"
                  )
              : "POSITION";

          return (
            <div
              className="panel pos"
              key={`${item.type}-${item.id}`}
            >
              <div className="head">
                <div className="pair">
                  <div className="coin">
                    {item.type === "POSITION"
                      ? "P"
                      : String(
                          item.symbol ||
                          "?"
                        ).charAt(0)}
                  </div>

                  <div>
                    <b>
                      {symbol}
                    </b>

                    <small>
                      {item.type === "POSITION"
                        ? "Position AI"
                        : "AI Signal"}
                    </small>
                  </div>
                </div>

                <span className="long">
                  {recommendation}
                </span>
              </div>

              <div className="levels">
                <div>
                  <small>
                    CONFIDENCE
                  </small>
                  <b>
                    {item.confidence != null
                      ? `${item.confidence}%`
                      : "—"}
                  </b>
                </div>

                <div>
                  <small>
                    PRICE
                  </small>
                  <b>
                    {formatPrice(item.price)}
                  </b>
                </div>

                <div>
                  <small>
                    PROVIDER
                  </small>
                  <b>
                    {String(
                      item.provider ||
                      "—"
                    ).toUpperCase()}
                  </b>
                </div>

                <div>
                  <small>
                    TYPE
                  </small>
                  <b>
                    {item.type}
                  </b>
                </div>
              </div>

              <div className="meta">
                <span>
                  <History/>
                  Created
                  <b>
                    {formatDate(
                      item.createdAt
                    )}
                  </b>
                </span>
              </div>

              {item.reasoning && (
                <p>
                  {item.reasoning}
                </p>
              )}
            </div>
          );
        })}
      </div>
    )}

    <TradeJournalPanel />
  </>
}

function TradeJournalPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setError("");
      const result = await fetchServerPositionMonitoring();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade journal unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  const stats = data?.journalStats || {};
  const journal = Array.isArray(data?.journal) ? data.journal.slice(0, 20) : [];

  return (
    <section className="panel" style={{marginTop:"18px"}}>
      <div className="head">
        <div className="pair">
          <div className="coin">J</div>
          <div>
            <b>TRADE JOURNAL</b>
            <small>Server-side position results · read only</small>
          </div>
        </div>
        <span className="long">{stats.closed ?? 0} CLOSED</span>
      </div>

      {loading ? (
        <p>Loading trade journal...</p>
      ) : error ? (
        <p>{error}</p>
      ) : (
        <>
          <div className="levels">
            <div><small>OPEN</small><b>{stats.open ?? 0}</b></div>
            <div><small>CLOSED</small><b>{stats.closed ?? 0}</b></div>
            <div><small>CLOSED P&L</small><b>{Number.isFinite(Number(stats.closedPnl)) ? Number(stats.closedPnl).toFixed(2) : "—"}</b></div>
            <div><small>POSITIVE / NEGATIVE</small><b>{stats.positiveCount ?? 0} / {stats.negativeCount ?? 0}</b></div>
            <div><small>AI CONF. AVG</small><b>{stats.averageAiConfidenceAtEntry != null ? Number(stats.averageAiConfidenceAtEntry).toFixed(1) + "%" : "—"}</b></div>
          </div>

          {journal.length ? (
            <div className="tablewrap" style={{marginTop:"14px"}}>
              <table>
                <thead>
                  <tr><th>MARKET</th><th>SIDE</th><th>ENTRY</th><th>LAST / EXIT</th><th>P&L</th><th>AI CONF.</th><th>STATUS</th></tr>
                </thead>
                <tbody>
                  {journal.map(row => (
                    <tr key={row.position_key}>
                      <td><strong>{row.symbol}</strong></td>
                      <td>{row.side === "SHORT" ? "SELL" : "BUY"}</td>
                      <td>{row.entry_price != null ? Number(row.entry_price).toLocaleString("en-US") : "—"}</td>
                      <td>{(row.exit_price ?? row.last_price) != null ? Number(row.exit_price ?? row.last_price).toLocaleString("en-US") : "—"}</td>
                      <td>{row.realized_pnl != null ? Number(row.realized_pnl).toFixed(2) : row.last_pnl != null ? Number(row.last_pnl).toFixed(2) : "—"}</td>
                      <td>{row.ai_confidence_at_entry != null ? Number(row.ai_confidence_at_entry).toFixed(0) + "%" : "—"}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{opacity:.55}}>Trades appear here after the server has observed a Pionex USDT-M position.</p>
          )}

          <small style={{display:"block",marginTop:"12px",opacity:.45}}>
            Server monitor runs independently of Android. Closed trades are inferred from the read-only Pionex open-position feed; the exit price is the last observed mark when Pionex no longer reports the position.
          </small>
        </>
      )}
    </section>
  );
}

function DiagnosticsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const runDiagnostics = async () => {
    setRunning(true);

    try {
      const response =
        await fetch(apiUrl("/api/diagnostics"), {
          cache: "no-store",
        });

      const result =
        await response.json();

      setData(result);
    } catch (error) {
      setData({
        success: false,
        status: "DIAGNOSTICS_ERROR",
        timestamp:
          new Date().toISOString(),
        totalDurationMs: null,
        checks: [
          {
            name: "Diagnostics",
            status: "ERROR",
            httpStatus: 0,
            durationMs: null,
            error:
              error instanceof Error
                ? error.message
                : "Unable to reach diagnostics API.",
          },
        ],
      });
    } finally {
      setLoading(false);
      setRunning(false);
    }
  };

  useEffect(() => {
    runDiagnostics();

    const timer =
      setInterval(
        runDiagnostics,
        30000
      );

    return () =>
      clearInterval(timer);
  }, []);

  const checks =
    Array.isArray(data?.checks)
      ? data.checks
      : [];

  const formatTime = value => {
    if (!value) return "—";

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "—";
    }

    return date.toLocaleTimeString(
      "nb-NO",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }
    );
  };

  const statusText = status => {
    if (status === "OK")
      return "ONLINE";

    if (status === "CONFIGURED")
      return "CONFIGURED";

    if (status === "ERROR")
      return "ERROR";

    return status || "UNKNOWN";
  };

  const statusClass = status => {
    if (
      status === "OK" ||
      status === "CONFIGURED"
    ) {
      return "status on";
    }

    if (status === "STALE") {
      return "status warning";
    }

    return "status";
  };

  return (
    <div className="panel" style={{
      marginTop: "18px",
      padding: "20px"
    }}>

      <div
        className="settinghead"
        style={{
          alignItems: "flex-start"
        }}
      >
        <div>
          <h2>
            <Activity/>
            SYSTEM DIAGNOSTICS
          </h2>

          <p>
            Live system health, API latency
            and integration errors.
          </p>
        </div>

        <button
          className="refresh"
          onClick={runDiagnostics}
          disabled={running}
        >
          <RefreshCw
            className={
              running
                ? "spin"
                : ""
            }
          />

          {running
            ? " Checking..."
            : " Run diagnostics"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(220px,1fr))",
          gap: "10px",
          marginTop: "18px"
        }}
      >
        {checks.map(check => (
          <div
            key={check.name}
            style={{
              border:
                "1px solid rgba(255,255,255,.08)",
              borderRadius: "10px",
              padding: "14px",
              background:
                "rgba(255,255,255,.02)"
            }}
          >

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: "10px"
              }}
            >
              <b>
                {check.name}
              </b>

              <span
                className={statusClass(
                  check.status
                )}
              >
                <i/>
                {statusText(
                  check.status
                )}
              </span>
            </div>

            <div
              className="meta"
              style={{
                marginTop: "12px"
              }}
            >
              <span>
                Latency
                <b>
                  {Number.isFinite(
                    Number(
                      check.durationMs
                    )
                  )
                    ? `${check.durationMs} ms`
                    : "—"}
                </b>
              </span>

              <span>
                HTTP
                <b>
                  {check.httpStatus ??
                    "—"}
                </b>
              </span>
            </div>

            {check.details && (
              <small
                style={{
                  display: "block",
                  marginTop: "10px",
                  color:
                    "rgba(255,255,255,.45)",
                  lineHeight: "1.5"
                }}
              >
                {check.name ===
                  "Pionex" &&
                  `Open positions: ${
                    check.details
                      .openPositions ??
                    0
                  }`}

                {check.name ===
                  "Supabase" &&
                  `Analyses: ${
                    check.details
                      .totalAnalyses ??
                    0
                  } • Provider: ${
                    check.details
                      .provider ??
                    "—"
                  }`}

                {check.name ===
                  "Market API" &&
                  `Scanned: ${
                    check.details
                      .scanned ??
                    0
                  } • Candidates: ${
                    check.details
                      .candidates ??
                    0
                  }`}

                {check.name ===
                  "Groq AI" &&
                  (
                    check.details
                      .note ||
                    `Provider: ${
                      check.details
                        .activeProvider ??
                      "—"
                    }`
                  )}

                {check.name ===
                  "Scheduler" &&
                  `Last run: ${check.details?.lastRun ? formatTime(check.details.lastRun) : "—"} • Age: ${check.details?.ageSeconds != null ? check.details.ageSeconds + "s" : "—"} • Spot: ${check.details?.spotMonitored ?? 0} • Futures: ${check.details?.futuresMonitored ?? 0}`}

                {check.name ===
                  "Market AI" &&
                  `Server snapshot: ${
                    check.details?.snapshotAgeSeconds != null
                      ? check.details.snapshotAgeSeconds + "s old"
                      : "—"
                  } • Scanned: ${
                    check.details?.scanned ?? 0
                  } • TOP 5: ${
                    check.details?.candidates ?? 0
                  } • Decision: ${
                    check.details?.finalDecision ?? "NO_TRADE"
                  } • Cadence: ${
                    check.details?.cadenceMinutes ?? 7
                  } min`}

                {check.name ===
                  "Backend" &&
                  "Supabase Edge API responding normally."}
              </small>
            )}

            {check.error && (
              <small
                style={{
                  display: "block",
                  marginTop: "10px",
                  color: "#ff6b6b",
                  lineHeight: "1.5"
                }}
              >
                Error: {check.error}
              </small>
            )}

          </div>
        ))}
      </div>

      {!checks.length && (
        <div
          style={{
            marginTop: "16px",
            color:
              "rgba(255,255,255,.45)"
          }}
        >
          {loading
            ? "Running system diagnostics..."
            : "No diagnostic results available."}
        </div>
      )}

      <div
        style={{
          marginTop: "16px",
          paddingTop: "14px",
          borderTop:
            "1px solid rgba(255,255,255,.06)",
          display: "flex",
          flexWrap: "wrap",
          gap: "18px",
          fontSize: "11px",
          color:
            "rgba(255,255,255,.4)"
        }}
      >
        <span>
          Overall:{" "}
          <b
            style={{
              color:
                data?.success
                  ? "#35e0a1"
                  : "#ff6b6b"
            }}
          >
            {data?.status ||
              "CHECKING"}
          </b>
        </span>

        <span>
          Total duration:{" "}
          <b>
            {Number.isFinite(
              Number(
                data?.totalDurationMs
              )
            )
              ? `${data.totalDurationMs} ms`
              : "—"}
          </b>
        </span>

        <span>
          Last check:{" "}
          <b>
            {formatTime(
              data?.timestamp
            )}
          </b>
        </span>

        <span>
          Auto check:{" "}
          <b>
            30s
          </b>
        </span>
      </div>

    </div>
  );
}


function TradeCriteriaPanel() {
  const defaults = {
    minimumScore: 75,
    minimumConfidence: 80,
    minimumRiskReward: 2,
    minimumRsi: 35,
    maximumRsi: 70,
    minimumVolumeRatio: 0.8,
    highRisk: {
      minimumScore: 85,
      minimumConfidence: 90,
    },
  };

  const [criteria, setCriteria] =
    useState(defaults);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const loadCriteria =
    async () => {
      setError("");

      try {
        const response =
          await fetch(apiUrl("/api/ai/trade-criteria"),
            {
              cache: "no-store",
            }
          );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        const result =
          await response.json();

        if (result?.criteria) {
          setCriteria(
            result.criteria
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load trade criteria."
        );
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    loadCriteria();
  }, []);

  const update =
    (key, value) => {
      setCriteria(prev => ({
        ...prev,
        [key]: value,
      }));

      setMessage("");
    };

  const updateHighRisk =
    (key, value) => {
      setCriteria(prev => ({
        ...prev,
        highRisk: {
          ...prev.highRisk,
          [key]: value,
        },
      }));

      setMessage("");
    };

  const save =
    async () => {
      setSaving(true);
      setMessage("");
      setError("");

      try {
        const response =
          await fetch(apiUrl("/api/ai/trade-criteria"),
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
                Accept:
                  "application/json",
              },
              body:
                JSON.stringify(
                  criteria
                ),
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error ||
            `HTTP ${response.status}`
          );
        }

        if (result?.criteria) {
          setCriteria(
            result.criteria
          );
        }

        setMessage(
          "Trade criteria saved."
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to save criteria."
        );
      } finally {
        setSaving(false);
      }
    };

  const reset =
    async () => {
      setCriteria(defaults);
      setMessage("");
      setError("");
    };

  return (
    <div
      className="panel"
      style={{
        marginTop: "18px",
        padding: "20px",
      }}
    >

      <div
        className="settinghead"
        style={{
          alignItems: "flex-start",
        }}
      >

        <div>
          <h2>
            <Target/>
            AI TRADE CRITERIA
          </h2>

          <p>
            Hard rules used by TradeMindMZ
            before a trade can be recommended.
          </p>
        </div>

        <span className="status on">
          <i/>
          ACTIVE
        </span>

      </div>

      {loading ? (
        <p
          style={{
            marginTop: "18px",
            color:
              "rgba(255,255,255,.45)",
          }}
        >
          Loading trade criteria...
        </p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(180px,1fr))",
              gap: "10px",
              marginTop: "18px",
            }}
          >

            <label className="settingrow">
              <div>
                <b>
                  Minimum Score
                </b>
                <small>
                  Local market score required.
                </small>
              </div>

              <input
                type="number"
                min="0"
                max="100"
                value={
                  criteria.minimumScore
                }
                onChange={e =>
                  update(
                    "minimumScore",
                    Number(
                      e.target.value
                    )
                  )
                }
                style={{
                  width: "80px",
                  padding: "8px",
                  borderRadius: "7px",
                  border:
                    "1px solid rgba(255,255,255,.12)",
                  background:
                    "rgba(255,255,255,.05)",
                  color: "#fff",
                }}
              />
            </label>

            <label className="settingrow">
              <div>
                <b>
                  Minimum Confidence
                </b>
                <small>
                  AI confidence required.
                </small>
              </div>

              <input
                type="number"
                min="0"
                max="100"
                value={
                  criteria.minimumConfidence
                }
                onChange={e =>
                  update(
                    "minimumConfidence",
                    Number(
                      e.target.value
                    )
                  )
                }
                style={{
                  width: "80px",
                  padding: "8px",
                  borderRadius: "7px",
                  border:
                    "1px solid rgba(255,255,255,.12)",
                  background:
                    "rgba(255,255,255,.05)",
                  color: "#fff",
                }}
              />
            </label>

            <label className="settingrow">
              <div>
                <b>
                  Minimum Risk / Reward
                </b>
                <small>
                  Required R/R ratio.
                </small>
              </div>

              <input
                type="number"
                step="0.1"
                min="0.1"
                max="20"
                value={
                  criteria.minimumRiskReward
                }
                onChange={e =>
                  update(
                    "minimumRiskReward",
                    Number(
                      e.target.value
                    )
                  )
                }
                style={{
                  width: "80px",
                  padding: "8px",
                  borderRadius: "7px",
                  border:
                    "1px solid rgba(255,255,255,.12)",
                  background:
                    "rgba(255,255,255,.05)",
                  color: "#fff",
                }}
              />
            </label>

            <label className="settingrow">
              <div>
                <b>
                  Minimum RSI
                </b>
                <small>
                  Lower RSI boundary.
                </small>
              </div>

              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={
                  criteria.minimumRsi
                }
                onChange={e =>
                  update(
                    "minimumRsi",
                    Number(
                      e.target.value
                    )
                  )
                }
                style={{
                  width: "80px",
                  padding: "8px",
                  borderRadius: "7px",
                  border:
                    "1px solid rgba(255,255,255,.12)",
                  background:
                    "rgba(255,255,255,.05)",
                  color: "#fff",
                }}
              />
            </label>

            <label className="settingrow">
              <div>
                <b>
                  Maximum RSI
                </b>
                <small>
                  Upper RSI boundary.
                </small>
              </div>

              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={
                  criteria.maximumRsi
                }
                onChange={e =>
                  update(
                    "maximumRsi",
                    Number(
                      e.target.value
                    )
                  )
                }
                style={{
                  width: "80px",
                  padding: "8px",
                  borderRadius: "7px",
                  border:
                    "1px solid rgba(255,255,255,.12)",
                  background:
                    "rgba(255,255,255,.05)",
                  color: "#fff",
                }}
              />
            </label>

            <label className="settingrow">
              <div>
                <b>
                  Minimum Volume Ratio
                </b>
                <small>
                  Required market volume.
                </small>
              </div>

              <input
                type="number"
                step="0.05"
                min="0"
                max="20"
                value={
                  criteria.minimumVolumeRatio
                }
                onChange={e =>
                  update(
                    "minimumVolumeRatio",
                    Number(
                      e.target.value
                    )
                  )
                }
                style={{
                  width: "80px",
                  padding: "8px",
                  borderRadius: "7px",
                  border:
                    "1px solid rgba(255,255,255,.12)",
                  background:
                    "rgba(255,255,255,.05)",
                  color: "#fff",
                }}
              />
            </label>

          </div>

          <div
            style={{
              marginTop: "18px",
              paddingTop: "18px",
              borderTop:
                "1px solid rgba(255,255,255,.06)",
            }}
          >

            <div
              style={{
                marginBottom: "12px",
              }}
            >
              <b>
                HIGH RISK PROTECTION
              </b>

              <small
                style={{
                  display: "block",
                  marginTop: "4px",
                  color:
                    "rgba(255,255,255,.4)",
                }}
              >
                High-risk recommendations need
                stronger confirmation.
              </small>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit,minmax(180px,1fr))",
                gap: "10px",
              }}
            >

              <label className="settingrow">
                <div>
                  <b>
                    HIGH Risk Score
                  </b>
                  <small>
                    Score required for HIGH risk.
                  </small>
                </div>

                <input
                  type="number"
                  min="0"
                  max="100"
                  value={
                    criteria.highRisk.minimumScore
                  }
                  onChange={e =>
                    updateHighRisk(
                      "minimumScore",
                      Number(
                        e.target.value
                      )
                    )
                  }
                  style={{
                    width: "80px",
                    padding: "8px",
                    borderRadius: "7px",
                    border:
                      "1px solid rgba(255,255,255,.12)",
                    background:
                      "rgba(255,255,255,.05)",
                    color: "#fff",
                  }}
                />
              </label>

              <label className="settingrow">
                <div>
                  <b>
                    HIGH Risk Confidence
                  </b>
                  <small>
                    Confidence required.
                  </small>
                </div>

                <input
                  type="number"
                  min="0"
                  max="100"
                  value={
                    criteria.highRisk.minimumConfidence
                  }
                  onChange={e =>
                    updateHighRisk(
                      "minimumConfidence",
                      Number(
                        e.target.value
                      )
                    )
                  }
                  style={{
                    width: "80px",
                    padding: "8px",
                    borderRadius: "7px",
                    border:
                      "1px solid rgba(255,255,255,.12)",
                    background:
                      "rgba(255,255,255,.05)",
                    color: "#fff",
                  }}
                />
              </label>

            </div>

          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginTop: "18px",
              flexWrap: "wrap",
            }}
          >

            <button
              className="refresh"
              onClick={save}
              disabled={saving}
            >
              <RefreshCw
                className={
                  saving
                    ? "spin"
                    : ""
                }
              />

              {saving
                ? " Saving..."
                : " Save criteria"}
            </button>

            <button
              type="button"
              onClick={reset}
              style={{
                border:
                  "1px solid rgba(255,255,255,.1)",
                background:
                  "rgba(255,255,255,.03)",
                color:
                  "rgba(255,255,255,.65)",
                borderRadius: "9px",
                padding:
                  "10px 14px",
                cursor: "pointer",
              }}
            >
              Reset form
            </button>

          </div>

          {message && (
            <div
              style={{
                marginTop: "12px",
                color: "#35e0a1",
                fontSize: "12px",
              }}
            >
              ✅ {message}
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: "12px",
                color: "#ff6b6b",
                fontSize: "12px",
              }}
            >
              ❌ {error}
            </div>
          )}

        </>
      )}

    </div>
  );
}

function SettingsPage({settings,updateSetting}){const Row=({id,title,desc})=><div className="settingrow"><div><b>{title}</b><small>{desc}</small></div><button className={settings[id]?"toggle on":"toggle"} onClick={()=>updateSetting(id,!settings[id])}><i/>{settings[id]?"ON":"OFF"}</button></div>;return <div className="settingspage"><div className="settingshero"><div><label><Settings/> AI CONTROL CENTER</label><h1>Control your AI usage.</h1><p>Turn AI providers on or off to control analysis and API usage. These settings are saved on this device.</p></div></div><div className="panel settingspanel"><div className="settinghead"><div><h2>AI ENGINE</h2><p>Main controls for TradeMindMZ intelligence.</p></div><span className={settings.ai?"status on":"status"}><i/>{settings.ai?"AI ACTIVE":"AI DISABLED"}</span></div><Row id="ai" title="AI Analysis" desc="Master switch for AI analysis."/><Row id="openai" title="OpenAI" desc="Allow OpenAI to perform analysis."/><Row id="groq" title="Groq" desc="Allow Groq to perform analysis and fallback."/><Row id="learning" title="Historical Learning" desc="Continue evaluating historical market outcomes." /></div><div className="panel costpanel"><h3>AI COST CONTROL</h3><p>When AI Analysis is OFF, TradeMindMZ must not send AI analysis requests. Market data and historical collection can continue independently.</p><div className="costgrid"><span><b>{settings.ai?"ACTIVE":"OFF"}</b><small>AI Analysis</small></span><span><b>{settings.openai&&settings.ai?"ACTIVE":"OFF"}</b><small>OpenAI</small></span><span><b>{settings.groq&&settings.ai?"ACTIVE":"OFF"}</b><small>Groq</small></span><span><b>{settings.learning?"ACTIVE":"OFF"}</b><small>Learning</small></span></div></div><TradeCriteriaPanel /><DiagnosticsPanel /><div className="panel settingsnote"><ShieldCheck/><div><b>Safety rule</b><p>TradeMindMZ V2 will never place a Pionex order automatically. The user manually confirms purchases in Pionex.</p></div></div></div>}


function Signals({bought,setBought,setManualPurchaseOpen,setPurchaseDefaults}){
  const [marketType, setMarketType] = useState("PERP");
  const [accountBalanceUsdt, setAccountBalanceUsdt] = useState(0);
  const [riskSizing, setRiskSizing] = useState(null);
  const [learningStats,setLearningStats] = useState(null);
  const [learningError,setLearningError] = useState("");
  const [signalHistory,setSignalHistory] = useState([]);

  const {
    data: rawData,
    loading,
    refreshing,
    error,
    refresh
  } = useLiveAiSignal({
    scanLimit: 100,
    maxMarkets: 25,
    preferredProvider: "groq",
    marketType,
    refreshInterval: 60000,
    // The server scheduler owns the 7-minute AI cycle. Do not start a heavy
    // Pionex+AI scan automatically when the Android tab is opened.
    initialScan: false
  });

  useEffect(() => {
    let active = true;
    fetch(apiUrl("/api/pionex/wallet-balances"), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(response => response.json())
      .then(result => {
        if (!active || result?.success !== true) return;
        const wallet = result?.data || {};
        const balance = marketType === "SPOT"
          ? Number(wallet?.botAccount?.totalInUsdt)
          : Number(wallet?.traderAccount?.totalInUsdt);
        if (Number.isFinite(balance) && balance > 0) {
          setAccountBalanceUsdt(balance);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [marketType]);

  useEffect(() => {
    let active = true;
    fetchLearningStats()
      .then(result => {
        if (!active) return;
        setLearningStats(result);
      })
      .catch(error => {
        if (!active) return;
        setLearningError(
          error instanceof Error
            ? error.message
            : "Learning statistics unavailable."
        );
      });
    return () => { active = false; };
  }, []);

  // Never display a snapshot from the other market while switching between PERP and SPOT.
  const data = rawData?.marketType && rawData.marketType !== marketType
    ? null
    : rawData;

  const recommended = data?.recommended || null;

  const rawCandidates = Array.isArray(data?.candidates)
    ? data.candidates
    : Array.isArray(data?.engineTop5)
      ? data.engineTop5
      : [];

  const earlyPreviewCandidate = rawCandidates
    .filter(candidate => candidate && typeof candidate === "object")
    .map(candidate => ({
      ...candidate,
      __score: Number(candidate?.engineScore ?? candidate?.score ?? candidate?.aiScore ?? 0),
      __confidence: Number(candidate?.aiConfidence ?? candidate?.confidence ?? 0)
    }))
    .filter(candidate => Number.isFinite(candidate.__score) && candidate.__score >= 70)
    .sort((a,b) => b.__score - a.__score)[0] || null;

  const signalDisplay = recommended || earlyPreviewCandidate || null;

  const symbolRaw = String(signalDisplay?.symbol || "—");
  const displaySymbol = symbolRaw.includes("_")
    ? symbolRaw.replace("_", " / ")
    : symbolRaw.replace("USDT", " / USDT");

  const directionRaw = String(
    signalDisplay?.direction ||
    signalDisplay?.side ||
    signalDisplay?.trend ||
    ""
  ).toUpperCase();

  const direction = marketType === "SPOT"
    ? (
        directionRaw === "BUY" || directionRaw === "LONG"
          ? "BUY"
          : directionRaw === "SELL" || directionRaw === "SHORT"
            ? "SELL"
            : ""
      )
    : (
        directionRaw === "BUY" || directionRaw === "LONG"
          ? "LONG"
          : directionRaw === "SELL" || directionRaw === "SHORT"
            ? "SHORT"
            : ""
      );

  const score = Number.isFinite(Number(signalDisplay?.engineScore))
    ? Number(signalDisplay.engineScore)
    : Number.isFinite(Number(signalDisplay?.score))
      ? Number(signalDisplay.score)
      : 0;

  const confidence = Number.isFinite(Number(signalDisplay?.aiConfidence))
    ? Number(signalDisplay.aiConfidence)
    : Number.isFinite(Number(signalDisplay?.confidence))
      ? Number(signalDisplay.confidence)
      : 0;

  const entry = Number.isFinite(Number(signalDisplay?.entry))
    ? Number(signalDisplay.entry)
    : 0;

  const stop = Number.isFinite(Number(signalDisplay?.stopLoss))
    ? Number(signalDisplay.stopLoss)
    : 0;

  const tp = Number.isFinite(Number(signalDisplay?.takeProfit))
    ? Number(signalDisplay.takeProfit)
    : 0;

  const rr = Number.isFinite(Number(signalDisplay?.riskReward))
    ? Number(signalDisplay.riskReward)
    : 0;

  const risk = String(signalDisplay?.riskLevel || "—").toUpperCase();
  const marketRegime = data?.marketRegime?.regime || "—";
  const reasoning =
    signalDisplay?.reasoning ||
    data?.summary ||
    "Awaiting live Pionex market analysis.";

  const finalDecision = String(data?.finalDecision || "").toUpperCase();
  const decisionLayerFailed = Boolean(
    error ||
    data?.decisionLayerError ||
    data?.aiDecisionError ||
    data?.providerError ||
    data?.aiDecision?.success === false ||
    String(data?.aiDecision?.reason || "").toLowerCase().includes("providers failed") ||
    String(data?.aiDecision?.reason || "").toLowerCase().includes("provider is available")
  );
  const evaluating = Boolean(
    !recommended &&
    earlyPreviewCandidate &&
    decisionLayerFailed
  );

  const verdict = String(
    evaluating ? "AI_EVALUATING" : (data?.verdict || "NO_TRADE")
  ).replace("_", " ");

  const comparison = Array.isArray(data?.comparison)
    ? data.comparison.filter(item => item && typeof item === "object")
    : [];

  const candidates = rawCandidates.filter(candidate => candidate && typeof candidate === "object");

  const earlyCandidates = candidates
    .map((candidate, index) => {
      const candidateScore = Number(
        candidate?.engineScore ??
        candidate?.score ??
        candidate?.aiScore ??
        0
      );
      const candidateConfidence = Number(
        candidate?.aiConfidence ??
        candidate?.confidence ??
        0
      );
      const rawDirection = String(
        candidate?.direction ??
        candidate?.side ??
        candidate?.trend ??
        ""
      ).toUpperCase();

      const signal = marketType === "SPOT"
        ? (
            rawDirection === "BUY" || rawDirection === "LONG"
              ? "BUY"
              : rawDirection === "SELL" || rawDirection === "SHORT"
                ? "SELL"
                : "WATCH"
          )
        : (
            rawDirection === "BUY" || rawDirection === "LONG"
              ? "LONG"
              : rawDirection === "SELL" || rawDirection === "SHORT"
                ? "SHORT"
                : "WATCH"
          );

      return {
        ...candidate,
        __index: index,
        __score: Number.isFinite(candidateScore) ? candidateScore : 0,
        __confidence: Number.isFinite(candidateConfidence) ? candidateConfidence : 0,
        __signal: signal,
      };
    })
    .filter(candidate => candidate.__score >= 70)
    .sort((a,b) => b.__score - a.__score)
    .slice(0,5);

  const signalCriteria = data?.criteria || null;
  const signalBestCandidate = signalCriteria?.bestCandidate || null;
  const signalFailedChecks = Array.isArray(signalCriteria?.failedChecks)
    ? signalCriteria.failedChecks
    : [];

  const formatSignalAge = value => {
    if (!value) return "—";
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return "—";
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return seconds + "s ago";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + "m ago";
    const hours = Math.floor(minutes / 60);
    return hours + "h " + (minutes % 60) + "m ago";
  };

  const signalAge = formatSignalAge(data?.updatedAt || data?.persistedAt);

  const [nextAnalysisSeconds, setNextAnalysisSeconds] = useState(null);

  useEffect(() => {
    const updateCountdown = () => {
      if (!data?.nextAnalysisAt) {
        setNextAnalysisSeconds(null);
        return;
      }

      const target = new Date(data.nextAnalysisAt).getTime();
      if (!Number.isFinite(target)) {
        setNextAnalysisSeconds(null);
        return;
      }

      setNextAnalysisSeconds(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [data?.nextAnalysisAt]);

  const nextAnalysisLabel = nextAnalysisSeconds == null
    ? "—"
    : nextAnalysisSeconds <= 0
      ? "NOW"
      : Math.floor(nextAnalysisSeconds / 60) + ":" + String(nextAnalysisSeconds % 60).padStart(2, "0");

  const noTradeReasons = [
    ...signalFailedChecks.map(check => {
      const label = check?.label || check?.key || "Trade criterion";
      const actual = check?.actual;
      const target = check?.target;
      return actual !== undefined && target !== undefined
        ? label + ": " + actual + " / required " + target
        : label;
    }),
    ...(Array.isArray(data?.whyNoTrade?.aiReasons)
      ? data.whyNoTrade.aiReasons
      : [])
  ].filter(Boolean);

  useEffect(() => {
    setSignalHistory([]);
  }, [marketType]);

  useEffect(() => {
    if (!data || data.marketType !== marketType) return;

    const timestamp = data.updatedAt || data.persistedAt;
    const historySymbol = String(
      data?.recommended?.symbol ||
      earlyPreviewCandidate?.symbol ||
      ""
    ).trim();

    const historyScore = Number(
      data?.recommended?.engineScore ??
      data?.recommended?.score ??
      earlyPreviewCandidate?.engineScore ??
      earlyPreviewCandidate?.score ??
      0
    );

    const historyConfidence = Number(
      data?.recommended?.aiConfidence ??
      data?.recommended?.confidence ??
      earlyPreviewCandidate?.aiConfidence ??
      earlyPreviewCandidate?.confidence ??
      0
    );

    if (!historySymbol || !timestamp || !Number.isFinite(historyScore)) return;

    setSignalHistory(previous => {
      const point = {
        id: timestamp + "-" + historySymbol + "-" + historyScore + "-" + historyConfidence,
        timestamp,
        symbol: historySymbol,
        score: historyScore,
        confidence: Number.isFinite(historyConfidence) ? historyConfidence : 0
      };

      if (previous.some(item => item.id === point.id)) return previous;

      return [point, ...previous].slice(0, 6);
    });
  }, [
    data?.updatedAt,
    data?.persistedAt,
    data?.marketType,
    data?.recommended?.symbol,
    data?.recommended?.engineScore,
    data?.recommended?.score,
    data?.recommended?.aiConfidence,
    data?.recommended?.confidence,
    earlyPreviewCandidate?.symbol,
    earlyPreviewCandidate?.engineScore,
    earlyPreviewCandidate?.score,
    earlyPreviewCandidate?.aiConfidence,
    earlyPreviewCandidate?.confidence,
    marketType
  ]);

  useEffect(() => {
    let active = true;
    setRiskSizing(null);
    if (!recommended || !entry || !stop) return undefined;

    const balance = accountBalanceUsdt;
    if (!(balance > 0)) return undefined;

    calculateRiskSizing({
      balanceUsdt: balance,
      entryPrice: entry,
      stopLoss: stop,
      marketType,
    }).then(result => {
      if (active) setRiskSizing(result);
    }).catch(() => {
      if (active) setRiskSizing(null);
    });

    return () => { active = false; };
  }, [recommended?.symbol, entry, stop, marketType, accountBalanceUsdt]);

  const normalizeSignalSymbol = value =>
    String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

  const technicalSymbol = normalizeSignalSymbol(recommended?.symbol);
  const technicalSource =
    (Array.isArray(data?.candidates)
      ? data.candidates.find(candidate =>
          normalizeSignalSymbol(candidate?.symbol) === technicalSymbol
        )
      : null) ||
    (normalizeSignalSymbol(data?.recommended?.symbol) === technicalSymbol
      ? data.recommended
      : null) ||
    (normalizeSignalSymbol(earlyPreviewCandidate?.symbol) === technicalSymbol
      ? earlyPreviewCandidate
      : null) ||
    {};

  const technicalIndicators = technicalSource?.indicators || {};

  const ema9 = Number(
    technicalSource?.ema9 ??
    technicalIndicators?.ema9
  );
  const ema21 = Number(
    technicalSource?.ema21 ??
    technicalIndicators?.ema21
  );
  const rsi = Number(
    technicalSource?.rsi ??
    technicalSource?.RSI ??
    technicalSource?.rsi14 ??
    technicalIndicators?.rsi ??
    technicalIndicators?.rsi14
  );
  const macd = Number(
    technicalSource?.macd ??
    technicalSource?.MACD ??
    technicalIndicators?.macd
  );
  const atrPercent = Number(
    technicalSource?.atrPercent ??
    technicalSource?.atrPct ??
    technicalSource?.atr_percent ??
    technicalIndicators?.atrPercent ??
    technicalIndicators?.atrPct
  );
  const volumeRatio = Number(
    technicalSource?.volumeRatio ??
    technicalSource?.volume_ratio ??
    technicalIndicators?.volumeRatio ??
    technicalIndicators?.volume_ratio
  );
  const change24h = Number(
    technicalSource?.change24h ??
    technicalIndicators?.change24h
  );

  const technicalMetrics = [
    [
      "EMA trend",
      Number.isFinite(ema9) && Number.isFinite(ema21)
        ? ema9 > ema21 ? "Bullish" : "Bearish"
        : "—"
    ],
    ["RSI", Number.isFinite(rsi) ? rsi.toFixed(1) : "—"],
    ["MACD", Number.isFinite(macd) ? macd.toFixed(4) : "—"],
    ["ATR", Number.isFinite(atrPercent) ? atrPercent.toFixed(2) + "%" : "—"],
    ["Volume ratio", Number.isFinite(volumeRatio) ? volumeRatio.toFixed(2) : "—"],
    ["24h change", Number.isFinite(change24h) ? (change24h >= 0 ? "+" : "") + change24h.toFixed(2) + "%" : "—"]
  ];

  const formatSignalPrice = value => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "—";
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(number);
  };

  const handlePurchase = async () => {
    if (!recommended || !direction || refreshing) return;

    const fresh = await refresh(true);
    const freshRecommendation = fresh?.recommended || null;
    const freshDirectionRaw = String(
      freshRecommendation?.direction || ""
    ).toUpperCase();

    const freshDirection = marketType === "SPOT"
      ? (
          freshDirectionRaw === "BUY" || freshDirectionRaw === "LONG"
            ? "BUY"
            : freshDirectionRaw === "SELL" || freshDirectionRaw === "SHORT"
              ? "SELL"
              : ""
        )
      : (
          freshDirectionRaw === "BUY" || freshDirectionRaw === "LONG"
            ? "LONG"
            : freshDirectionRaw === "SELL" || freshDirectionRaw === "SHORT"
              ? "SHORT"
              : ""
        );

    if (!freshRecommendation || !freshDirection) return;

    setPurchaseDefaults({
      symbol: String(freshRecommendation.symbol || "").replace("_",""),
      side: freshDirection === "SHORT" || freshDirection === "SELL" ? "SHORT" : "LONG",
      entryPrice: Number(freshRecommendation.entry) || 0,
      stopLoss: Number(freshRecommendation.stopLoss) || 0,
      takeProfit: Number(freshRecommendation.takeProfit) || 0,
      holdTimeMinMinutes: Number(freshRecommendation.holdTimeMinMinutes) || 0,
      holdTimeMaxMinutes: Number(freshRecommendation.holdTimeMaxMinutes) || 0,
      holdTimeReason: freshRecommendation.holdTimeReason || "",
      marketType
    });

    setManualPurchaseOpen(true);
  };

  const tradeApproved = Boolean(
    recommended &&
    direction &&
    finalDecision === "TRADE"
  );

  const headerText = loading
    ? "AI is scanning the live market."
    : tradeApproved
      ? "AI has found a qualified setup."
      : evaluating
        ? "AI is evaluating the best early signal."
        : "No confirmed trade yet.";

  return (
    <>
      <div className="hero">
        <div>
          <label><Zap/> AI SIGNALS</label>
          <h1>{headerText}</h1>
          <p>
            Pionex market scan → early candidates → AI final decision.
            Analysis only. No automatic trading.
          </p>
        </div>

        <button
          className="refresh"
          onClick={() => refresh(true)}
          disabled={loading || refreshing}
        >
          <RefreshCw className={refreshing ? "spin" : ""}/>
          {refreshing ? " Scanning..." : " Refresh analysis"}
        </button>
      </div>

      <div className="panel" style={{padding:"10px 14px", marginBottom:"18px"}}>
        <div className="metric" style={{padding:"0"}}>
          <span>Next server AI analysis</span>
          <b>{nextAnalysisLabel}</b>
        </div>
      </div>

      <div
        style={{
          display:"grid",
          gridTemplateColumns:"1fr 1fr",
          gap:"6px",
          padding:"5px",
          marginBottom:"18px",
          border:"1px solid rgba(255,255,255,.08)",
          borderRadius:"12px",
          background:"rgba(255,255,255,.025)"
        }}
      >
        {[
          ["PERP","M-USDT / PERP"],
          ["SPOT","SPOT"]
        ].map(([value,label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMarketType(value)}
            style={{
              border: marketType === value
                ? "1px solid rgba(54,224,161,.55)"
                : "1px solid transparent",
              background: marketType === value
                ? "rgba(54,224,161,.12)"
                : "transparent",
              color: marketType === value ? "#fff" : "rgba(255,255,255,.5)",
              borderRadius:"9px",
              padding:"11px 12px",
              fontWeight:700,
              letterSpacing:".05em",
              cursor:"pointer"
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div
          className="panel"
          style={{
            padding:"16px",
            marginBottom:"18px",
            borderColor: evaluating
              ? "rgba(255,193,7,.28)"
              : "rgba(255,107,107,.25)"
          }}
        >
          <strong>
            {evaluating ? "AI decision layer is evaluating" : "AI signal unavailable"}
          </strong>
          <p style={{margin:"6px 0 0",opacity:.65}}>
            {evaluating
              ? "The market scanner found early candidates. The final AI decision is not available yet."
              : error}
          </p>
        </div>
      )}

      <div className="grid">
        <div
          className="panel main"
          style={{
            borderColor: tradeApproved
              ? "rgba(53,224,161,.45)"
              : "rgba(255,255,255,.09)"
          }}
        >
          <div className="head">
            <div className="pair">
              <div className="coin">
                {symbolRaw.startsWith("BTC") ? "₿" : symbolRaw.charAt(0) || "?"}
              </div>
              <div>
                <b>{displaySymbol}</b>
                <small>
                  {marketType === "SPOT" ? "Pionex SPOT" : "Pionex USDT-M PERP"}
                  {" → "}
                  {String(data?.provider || "AI").toUpperCase()}
                </small>
              </div>
            </div>

            <span className={
              evaluating
                ? "status"
                : direction === "SELL" || direction === "SHORT"
                  ? "short"
                  : "long"
            }>
              <TrendingUp/>
              {tradeApproved
                ? direction
                : evaluating
                  ? "AI EVALUATING"
                  : "NO TRADE"}
            </span>
          </div>

          <div className="core">
            <Ring score={score}/>
            <div className="copy">
              <div>
                <small>AI CONFIDENCE</small>
                <b>{confidence > 0 ? confidence + "%" : "—"}</b>
              </div>
              <div className="meter">
                <i style={{width:Math.max(0,Math.min(100,confidence))+"%"}}/>
              </div>
              <p>{reasoning}</p>
            </div>
          </div>

          <div className="levels">
            {[
              ["ENTRY", formatSignalPrice(entry)],
              ["TAKE PROFIT", formatSignalPrice(tp)],
              ["STOP LOSS", formatSignalPrice(stop)]
            ].map((x,i)=>
              <div className={i===2 ? "danger" : ""} key={x[0]}>
                <small>{x[0]}</small>
                <b>{x[1]}</b>
              </div>
            )}
          </div>

          <div
            style={{
              marginTop:"14px",
              padding:"14px",
              borderRadius:"10px",
              border: tradeApproved
                ? "1px solid rgba(53,224,161,.2)"
                : "1px solid rgba(255,107,107,.18)",
              background: tradeApproved
                ? "rgba(53,224,161,.045)"
                : "rgba(255,107,107,.035)"
            }}
          >
            <div style={{fontSize:"10px",letterSpacing:".14em",opacity:.45}}>
              FINAL DECISION
            </div>
            <strong style={{
              display:"block",
              marginTop:"4px",
              fontSize:"22px",
              color: tradeApproved
                ? "#35e0a1"
                : evaluating
                  ? "#ffc857"
                  : "#ff7777"
            }}>
              {tradeApproved
                ? direction
                : evaluating
                  ? "AI EVALUATING"
                  : "NO TRADE"}
            </strong>
            <span style={{display:"block",marginTop:"4px",fontSize:"12px",opacity:.62}}>
              {tradeApproved
                ? "AI approved this setup after the final trade checks."
                : evaluating
                  ? "Early candidate found. Waiting for the final AI decision."
                  : "Candidate data can be strong without becoming a confirmed trade."}
            </span>
          </div>

          <div className="meta">
            <span><Target/> R/R <b>{rr ? "1 : " + rr : "—"}</b></span>
            <span><History/> AI verdict <b>{verdict}</b></span>
            <span>Risk <b>{risk}</b></span>
            <span>Regime <b>{marketRegime}</b></span>
            <span><Radio/> Signal age <b>{signalAge}</b></span>
            {data?.tradeQuality?.costs ? (
              <span>
                Net edge <b>{Number(data.tradeQuality.costs.netTargetRate * 100).toFixed(2)}%</b>
              </span>
            ) : null}
            {direction ? (
              <span>
                <History/> Hold time <b>
                  {Number(recommended?.holdTimeMinMinutes) > 0
                    ? recommended.holdTimeMinMinutes + "–" + recommended.holdTimeMaxMinutes + " min"
                    : "—"}
                </b>
              </span>
            ) : null}
          </div>

          {riskSizing ? (
            <div className="meta" style={{marginTop:"10px"}}>
              <span>Suggested size <b>{Number(riskSizing.suggestedNotionalUsdt).toFixed(2)} USDT</b></span>
              <span>Max loss <b>{Number(riskSizing.maxLossUsdt).toFixed(2)} USDT</b></span>
            </div>
          ) : null}

          <button
            className={bought ? "buy done" : "buy"}
            onClick={handlePurchase}
            disabled={!tradeApproved || loading || refreshing}
          >
            {bought
              ? <><ShieldCheck/> PURCHASE REGISTERED IN PIONEX</>
              : tradeApproved
                ? <><Wallet/> I BOUGHT THIS IN PIONEX</>
                : evaluating
                  ? <><ShieldCheck/> WAITING FOR FINAL AI DECISION</>
                  : <><ShieldCheck/> NO TRADE — NO PURCHASE</>}
          </button>

          <small className="note">
            Manual Pionex confirmation only. TradeMindMZ does not place orders.
          </small>
        </div>

        <div className="stack">
          <div
            className="panel"
            style={{
              borderColor:"rgba(76,180,255,.18)"
            }}
          >
            <div className="settinghead" style={{alignItems:"flex-start"}}>
              <div>
                <h3><Zap/> EARLY SIGNALS</h3>
                <p>
                  Earlier market candidates are shown before the final AI decision.
                  This is a watchlist, not an automatic trade recommendation.
                </p>
              </div>
              <span className="status on"><i/> LIVE</span>
            </div>

            {earlyCandidates.length ? (
              <div style={{marginTop:"12px"}}>
                {earlyCandidates.map((candidate,index) => (
                  <div
                    key={String(candidate.symbol || index)}
                    style={{
                      display:"grid",
                      gridTemplateColumns:"28px 1fr auto auto",
                      gap:"10px",
                      alignItems:"center",
                      padding:"10px 0",
                      borderTop:index ? "1px solid rgba(255,255,255,.06)" : "none"
                    }}
                  >
                    <small style={{opacity:.45}}>{index + 1}</small>
                    <div>
                      <strong>{String(candidate.symbol || "—").replace("_"," / ")}</strong>
                      <small style={{display:"block",opacity:.48,marginTop:"2px"}}>
                        {candidate.__signal}
                      </small>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <small style={{display:"block",opacity:.42}}>ENGINE</small>
                      <strong>{candidate.__score}</strong>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <small style={{display:"block",opacity:.42}}>AI</small>
                      <strong>{candidate.__confidence > 0 ? candidate.__confidence + "%" : "—"}</strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{opacity:.5,marginTop:"12px"}}>
                No early candidates meet the current preview threshold.
              </p>
            )}
          </div>

          {data?.verdict === "NO_TRADE" && (
            <div className="panel">
              <div className="settinghead" style={{alignItems:"flex-start"}}>
                <div>
                  <h3><Target/> WHY NO TRADE?</h3>
                  <p>Final filters remain visible so a strong candidate is not mistaken for an approved trade.</p>
                </div>
                <span className="status"><i/> NO TRADE</span>
              </div>

              {signalBestCandidate && (
                <div style={{
                  marginTop:"12px",
                  padding:"12px",
                  borderRadius:"9px",
                  border:"1px solid rgba(255,255,255,.07)",
                  background:"rgba(255,255,255,.02)"
                }}>
                  <small style={{opacity:.42}}>BEST CANDIDATE</small>
                  <strong style={{display:"block",marginTop:"3px"}}>
                    {signalBestCandidate.symbol}
                  </strong>
                  <span style={{fontSize:"12px",opacity:.5}}>
                    {marketType === "SPOT" ? "SPOT" : "M-USDT / PERP"}
                  </span>
                </div>
              )}

              {signalFailedChecks.length ? (
                <div style={{marginTop:"12px"}}>
                  {signalFailedChecks.map(check => (
                    <div key={check.key} style={{
                      display:"flex",
                      justifyContent:"space-between",
                      gap:"10px",
                      padding:"8px 0",
                      borderTop:"1px solid rgba(255,255,255,.05)"
                    }}>
                      <span style={{fontSize:"12px"}}>{check.label}</span>
                      <b style={{color:"#ff7777",fontSize:"12px"}}>
                        {check.actual ?? "—"} / {check.target ?? "—"}
                      </b>
                    </div>
                  ))}
                </div>
              ) : null}

              {noTradeReasons.length ? (
                <div style={{
                  marginTop:"12px",
                  padding:"10px 12px",
                  borderRadius:"9px",
                  border:"1px solid rgba(255,119,119,.16)",
                  background:"rgba(255,119,119,.035)"
                }}>
                  <small style={{display:"block",opacity:.42}}>PRIMARY REASON</small>
                  <strong style={{display:"block",marginTop:"4px",fontSize:"13px"}}>
                    {noTradeReasons[0]}
                  </strong>
                  {noTradeReasons.length > 1 && (
                    <span style={{display:"block",marginTop:"5px",fontSize:"11px",opacity:.5}}>
                      Also: {noTradeReasons.slice(1,4).join(" • ")}
                    </span>
                  )}
                </div>
              ) : (
                <p style={{marginTop:"12px",fontSize:"12px",opacity:.58}}>
                  Final AI decision did not approve the candidate.
                </p>
              )}
            </div>
          )}

          <div className="panel">
            <h3><BrainCircuit/> SIGNAL QUALITY</h3>
            {[
              ["AI provider", data?.provider || "—"],
              ["Engine score", score ? String(score) : "—"],
              ["Confidence", confidence ? confidence + "%" : "—"],
              ["Risk", risk],
              ["Verdict", verdict]
            ].map(x =>
              <div className="metric" key={x[0]}>
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </div>
            )}

            <h3 style={{marginTop:"18px"}}><LineChart/> TECHNICAL DATA</h3>
            {technicalMetrics.map(x =>
              <div className="metric" key={x[0]}>
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </div>
            )}

            <h3 style={{marginTop:"18px"}}><History/> SIGNAL SCORE HISTORY</h3>
            <p style={{marginBottom:"8px",fontSize:"11px",opacity:.45}}>
              Session history of snapshots seen by this AI Signals screen.
            </p>
            {signalHistory.length ? (
              <div style={{display:"grid",gap:"6px"}}>
                {signalHistory.map(point => (
                  <div
                    key={point.id}
                    className="metric"
                    style={{padding:"7px 0"}}
                  >
                    <span>
                      {point.symbol.replace("_"," / ")}
                      {" · "}
                      {new Date(point.timestamp).toLocaleTimeString("nb-NO", {
                        hour:"2-digit",
                        minute:"2-digit"
                      })}
                    </span>
                    <b>
                      {point.score}
                      {" / "}
                      {point.confidence > 0 ? point.confidence + "%" : "—"}
                    </b>
                  </div>
                ))}
              </div>
            ) : (
              <div className="metric">
                <span>Waiting for signal snapshots</span>
                <b>—</b>
              </div>
            )}
          </div>

          <div className="panel">
            <h3><History/> AI LEARNING</h3>
            <strong className="big">
              {learningStats?.totalAnalyses ?? "—"}
            </strong>
            <p>AI position analyses stored</p>
            {learningError && <small className="note">{learningError}</small>}
            <div className="mini">
              <span>
                <b>
                  {learningStats?.averageConfidence != null
                    ? learningStats.averageConfidence + "%"
                    : "—"}
                </b>
                <small>avg confidence</small>
              </span>
              <span>
                <b>{learningStats ? (learningStats.recommendations?.WATCH || 0) : "—"}</b>
                <small>BUY/SELL analyses</small>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <h2>Recent AI Signals</h2>
        <button onClick={() => refresh(false)}>
          View all <ChevronRight/>
        </button>
      </div>

      <div className="opps">
        {(comparison.length
          ? comparison
              .filter(x => {
                if (!x || typeof x !== "object") return false;
                if (x.symbol === symbolRaw) return false;
                const side = String(x.direction || x.side || "").toUpperCase();
                return side === "BUY" || side === "SELL" || side === "LONG" || side === "SHORT";
              })
              .slice(0,3)
          : []
        ).filter(Boolean).map(x =>
          <div className="panel opp" key={String(x.symbol || Math.random())}>
            <div>
              <b>{String(x.symbol || "").replace("_"," / ")}</b>
              <span>
                {["SELL","SHORT"].includes(String(x.direction || x.side || "").toUpperCase())
                  ? (marketType === "SPOT" ? "SELL" : "SHORT")
                  : (marketType === "SPOT" ? "BUY" : "LONG")}
              </span>
            </div>
            <strong>
              {x.score ?? x.engineScore ?? "—"}
              <small> ENGINE SCORE</small>
            </strong>
            <p>{x.assessment || "Compared by AI."}</p>
          </div>
        )}

        {!comparison.length && (
          <div className="panel opp">
            <div>
              <b>Waiting for market scan</b>
              <span>LIVE</span>
            </div>
            <strong>—<small> ENGINE SCORE</small></strong>
            <p>Refresh analysis to load the current Pionex TOP 5.</p>
          </div>
        )}
      </div>
    </>
  );
}

function formatPrice(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "—";
  }

  const number = Number(value);

  if (
    Math.abs(number) >= 1000
  ) {
    return number.toLocaleString(
      "en-US",
      {
        maximumFractionDigits: 2
      }
    );
  }

  if (
    Math.abs(number) >= 1
  ) {
    return number.toFixed(2);
  }

  return number.toFixed(6);
}

function formatPnl(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "—";
  }

  const number =
    Number(value);

  return (
    number >= 0
      ? "+"
      : ""
  ) +
    number.toFixed(2);
}

function pnlClass(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const number =
    Number(value);

  if (number > 0) {
    return "positive";
  }

  if (number < 0) {
    return "negative";
  }

  return "";
}

function Positions(){
  const [positions,setPositions] = useState([]);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [error,setError] = useState("");
  const [ai,setAi] = useState({});
  const [aiLoading,setAiLoading] = useState({});
  const [marketSnapshot,setMarketSnapshot] = useState(null);

  const loadPositions = async () => {
    setRefreshing(true);
    setError("");

    try {
      const tracked = loadTrackedPositions().filter(
        position => String(position?.status || "LIVE").toUpperCase() === "LIVE"
      );

      let pionexPositions = [];
      let pionexError = "";

      try {
        const serverMonitoring = await fetchServerPositionMonitoring();
        pionexPositions = Array.isArray(serverMonitoring?.positions)
          ? serverMonitoring.positions
          : [];
      } catch (serverError) {
        console.warn("Server position monitoring unavailable:", serverError);
        try {
          const result = await fetchLivePositions();
          pionexPositions = Array.isArray(result?.positions)
            ? result.positions
            : [];
        } catch (err) {
          pionexError = err instanceof Error
            ? err.message
            : "Pionex live positions unavailable.";
        }
      }

      let snapshot = marketSnapshot;
      try {
        snapshot = await fetchLatestAiSignal({
          interval: "15M",
          maxMarkets: 25,
          preferredProvider: "groq",
        });
        setMarketSnapshot(snapshot);
      } catch (snapshotError) {
        console.warn(
          "Persisted market snapshot unavailable for position AI:",
          snapshotError
        );
      }

      const marketCandidates =
        Array.isArray(snapshot?.candidates)
          ? snapshot.candidates
          : Array.isArray(snapshot?.engineTop5)
            ? snapshot.engineTop5
            : [];

      const samePosition = (a,b) => {
        const symbolA = String(a?.symbol || "").toUpperCase();
        const symbolB = String(b?.symbol || "").toUpperCase();
        const sideA = String(a?.side || a?.direction || "").toUpperCase();
        const sideB = String(b?.side || b?.direction || "").toUpperCase();
        return symbolA === symbolB && (
          sideA === sideB ||
          (sideA === "LONG" && sideB === "BUY") ||
          (sideA === "SHORT" && sideB === "SELL") ||
          !sideA || !sideB
        );
      };

      const merged = [...pionexPositions];

      for (const trackedPosition of tracked) {
        const liveIndex = merged.findIndex(
          position => samePosition(position, trackedPosition)
        );

        const market = marketCandidates.find(candidate =>
          String(candidate?.symbol || "").toUpperCase() ===
          String(trackedPosition?.symbol || "").toUpperCase()
        ) || null;

        const enrichedTracked = {
          ...trackedPosition,
          source: "MANUAL_PIONEX",
          status: "LIVE",
          readOnly: true,
          engineScore: Number.isFinite(Number(market?.engineScore ?? market?.score))
            ? Number(market?.engineScore ?? market?.score)
            : null,
          rsi: Number.isFinite(Number(market?.rsi ?? market?.indicators?.rsi14))
            ? Number(market?.rsi ?? market?.indicators?.rsi14)
            : null,
          volumeRatio: Number.isFinite(Number(market?.volumeRatio ?? market?.indicators?.volumeRatio))
            ? Number(market?.volumeRatio ?? market?.indicators?.volumeRatio)
            : null,
          marketConfidence: Number.isFinite(Number(market?.confidence))
            ? Number(market.confidence)
            : null,
          marketRiskReward: Number.isFinite(Number(market?.riskReward))
            ? Number(market.riskReward)
            : null,
          marketUpdatedAt: snapshot?.updatedAt || snapshot?.createdAt || null,
          currentPrice:
            Number.isFinite(Number(trackedPosition.currentPrice))
              ? Number(trackedPosition.currentPrice)
              : Number.isFinite(Number(market?.price))
                ? Number(market.price)
                : null,
          markPrice:
            Number.isFinite(Number(trackedPosition.markPrice))
              ? Number(trackedPosition.markPrice)
              : Number.isFinite(Number(market?.price))
                ? Number(market.price)
                : null,
        };

        if (liveIndex >= 0) {
          merged[liveIndex] = {
            ...enrichedTracked,
            ...merged[liveIndex],
            source: "PIONEX + MANUAL TRACKING",
            trackedPositionId: trackedPosition.id,
            stopLoss: trackedPosition.stopLoss,
            takeProfit: trackedPosition.takeProfit,
            engineScore: Number.isFinite(Number(trackedPosition.engineScore))
              ? Number(trackedPosition.engineScore)
              : merged[liveIndex]?.engineScore ?? enrichedTracked.engineScore,
            rsi: Number.isFinite(Number(trackedPosition.rsi))
              ? Number(trackedPosition.rsi)
              : merged[liveIndex]?.rsi ?? enrichedTracked.rsi,
            volumeRatio: Number.isFinite(Number(trackedPosition.volumeRatio))
              ? Number(trackedPosition.volumeRatio)
              : merged[liveIndex]?.volumeRatio ?? enrichedTracked.volumeRatio,
            marketConfidence: Number.isFinite(Number(trackedPosition.marketConfidence))
              ? Number(trackedPosition.marketConfidence)
              : merged[liveIndex]?.marketConfidence ?? enrichedTracked.marketConfidence,
            marketRiskReward: Number.isFinite(Number(trackedPosition.marketRiskReward))
              ? Number(trackedPosition.marketRiskReward)
              : merged[liveIndex]?.marketRiskReward ?? enrichedTracked.marketRiskReward,
            marketUpdatedAt: trackedPosition.marketUpdatedAt || merged[liveIndex]?.marketUpdatedAt || enrichedTracked.marketUpdatedAt,
            holdTimeMinMinutes: trackedPosition.holdTimeMinMinutes,
            holdTimeMaxMinutes: trackedPosition.holdTimeMaxMinutes,
            holdTimeReason: trackedPosition.holdTimeReason,
          };
        } else {
          merged.push(enrichedTracked);
        }
      }

      setPositions(merged);

      if (pionexError && !merged.length) {
        setError(pionexError);
      } else if (pionexError) {
        console.warn("Pionex live positions unavailable:", pionexError);
      }

      for (const position of merged) {
        const key = String(
          position.trackedPositionId ||
          position.id ||
          position.symbol
        );

        const serverAnalysis = position?.monitor || null;

        if (serverAnalysis) {
          setAi(prev => ({
            ...prev,
            [key]: {
              recommendation: serverAnalysis.analyzedAt
                ? (serverAnalysis.recommendation || "WATCH")
                : "WAITING",
              riskLevel: serverAnalysis.riskLevel || "MEDIUM",
              confidence: serverAnalysis.confidence ?? 0,
              confidenceDelta: serverAnalysis.confidenceDelta,
              reasoning: serverAnalysis.reasoning || "Server AI monitoring is active.",
              action: serverAnalysis.action || "",
              holdTimeMinMinutes: serverAnalysis.holdTimeMinMinutes || 0,
              holdTimeMaxMinutes: serverAnalysis.holdTimeMaxMinutes || 0,
              holdTimeReason: serverAnalysis.holdTimeReason || "",
              provider: serverAnalysis.provider || "groq",
              analyzedAt: serverAnalysis.analyzedAt || null,
              exitWarning: serverAnalysis.exitWarning === true,
              serverSide: true,
            }
          }));
          continue;
        }

        if (ai[key]) continue;

        try {
          setAiLoading(prev => ({ ...prev, [key]: true }));

          const symbolForMarket =
            String(position.symbol || "").trim().toUpperCase();

          const market = marketCandidates.find(candidate =>
            String(candidate?.symbol || "").toUpperCase() === symbolForMarket
          ) || {};

          const result = await analyzePositionWithAI(position, market);

          if (result?.success && result?.analysis) {
            setAi(prev => ({
              ...prev,
              [key]: {
                ...result.analysis,
                provider: result.provider || "groq",
                historySaved: result.historySaved === true,
                historyId: result.historyId || null
              }
            }));
          }
        } catch (analysisError) {
          console.error("Position AI analysis failed:", analysisError);
        } finally {
          setAiLoading(prev => ({ ...prev, [key]: false }));
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load positions."
      );
      setPositions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPositions();

    const onPositionUpdated = () => {
      setAi({});
      loadPositions();
    };

    window.addEventListener(
      "trademindmz-position-updated",
      onPositionUpdated
    );

    const timer = setInterval(() => {
      setAi({});
      loadPositions();
    }, 7 * 60 * 1000);

    return () => {
      clearInterval(timer);
      window.removeEventListener(
        "trademindmz-position-updated",
        onPositionUpdated
      );
    };
  }, []);

  const formatPrice = value => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "—";
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(number);
  };

  const formatPnl = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return (number >= 0 ? "+" : "") + number.toFixed(2);
  };

  const formatPercent = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return (number >= 0 ? "+" : "") + number.toFixed(2) + "%";
  };

  const formatTime = value => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const distancePercent = (current, target, side, kind) => {
    const price = Number(current);
    const level = Number(target);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(level) || level <= 0) {
      return null;
    }

    const direction = String(side || "").toUpperCase();
    if (kind === "TP") {
      return direction === "SHORT"
        ? ((price - level) / price) * 100
        : ((level - price) / price) * 100;
    }

    return direction === "SHORT"
      ? ((level - price) / price) * 100
      : ((price - level) / price) * 100;
  };

  const healthState = (analysis, pnlPercent) => {
    const recommendation = String(analysis?.recommendation || "WATCH").toUpperCase();
    const risk = String(analysis?.riskLevel || "MEDIUM").toUpperCase();
    const confidence = Number(analysis?.confidence);
    const delta = Number(analysis?.confidenceDelta);

    // A position without a completed AI analysis is not a warning by itself.
    const hasCompletedServerAnalysis = Boolean(
      analysis?.serverSide &&
      analysis?.analyzedAt &&
      recommendation !== "WAITING"
    );
    const hasCompletedLocalAnalysis = Boolean(
      analysis &&
      !analysis.serverSide &&
      (
        Number.isFinite(confidence) ||
        recommendation !== "WATCH"
      )
    );

    if (
      recommendation === "WAITING" ||
      (analysis?.serverSide && !hasCompletedServerAnalysis) ||
      (!analysis?.serverSide && !hasCompletedLocalAnalysis)
    ) {
      return { label: "WAITING", className: "neutral" };
    }

    if (
      recommendation === "EXIT_CONSIDERATION" ||
      risk === "CRITICAL" ||
      (Number.isFinite(delta) && delta <= -10)
    ) {
      return { label: "ATTENTION", className: "negative" };
    }

    if (
      recommendation === "REDUCE_RISK" ||
      risk === "HIGH" ||
      (Number.isFinite(confidence) && confidence < 60) ||
      (Number.isFinite(pnlPercent) && pnlPercent < 0)
    ) {
      return { label: "CAUTION", className: "warning" };
    }

    return { label: "HEALTHY", className: "positive" };
  };

  return <>
    <div className="hero">
      <div>
        <label><Radio/> PIONEX LIVE POSITIONS</label>
        <h1>AI watches what you actually bought.</h1>
        <p>
          Manual purchases are tracked locally and merged with read-only
          Pionex positions. AI monitors both without placing orders.
        </p>
      </div>

      <button
        className="refresh"
        onClick={() => { setAi({}); loadPositions(); }}
        disabled={refreshing}
      >
        <RefreshCw className={refreshing ? "spin" : ""}/>
        {refreshing ? " Refreshing..." : " Refresh positions"}
      </button>
    </div>

    {error && !positions.length ? (
      <div className="panel" style={{padding:"24px"}}>
        <div className="live-position-empty">
          <ShieldCheck size={28}/>
          <h3>Unable to load positions</h3>
          <p>{error}</p>
        </div>
      </div>
    ) : loading ? (
      <div className="panel" style={{padding:"30px"}}>
        <div className="live-position-empty">
          <Radio size={28}/>
          <h3>Loading AI monitoring...</h3>
          <p>Reading tracked purchases and Pionex positions.</p>
        </div>
      </div>
    ) : !positions.length ? (
      <div className="panel" style={{padding:"30px"}}>
        <div className="live-position-empty">
          <ShieldCheck size={28}/>
          <h3>No positions being monitored</h3>
          <p>
            Press "I BOUGHT THIS — START AI MONITORING" after a manual
            Pionex purchase.
          </p>
        </div>
      </div>
    ) : (
      <div className="positions">
        {positions.map(position => {
          const symbol = String(position.symbol || "")
            .replace("_USDT"," / USDT")
            .replace("USDT"," / USDT");

          const side = String(
            position.side || position.direction || "LIVE"
          ).toUpperCase();

          const entry = Number(position.entryPrice);
          const current = Number(position.currentPrice ?? position.markPrice);
          const stopLoss = Number(position.stopLoss);
          const takeProfit = Number(position.takeProfit);

          const rawPnl = Number(position.unrealizedPnl);
          const pnl = Number.isFinite(rawPnl) ? rawPnl : null;
          const margin = Number(position.margin);
          let pnlPercent = null;
          let pnlPercentType = "PRICE MOVE";
          if (Number.isFinite(pnl) && Number.isFinite(margin) && margin > 0) {
            pnlPercent = (pnl / margin) * 100;
            pnlPercentType = "PNL %";
          } else if (
            Number.isFinite(entry) &&
            entry > 0 &&
            Number.isFinite(current) &&
            current > 0
          ) {
            pnlPercent =
              side === "SHORT"
                ? ((entry-current)/entry)*100
                : ((current-entry)/entry)*100;
          }
          const key = String(
            position.trackedPositionId || position.id || position.symbol
          );
          const analysis = ai[key];
          const analysisLoading = Boolean(aiLoading[key]);
          const isTracked = String(position.source || "").includes("MANUAL");

          const holdMin = Number(
            analysis?.holdTimeMinMinutes ?? position.holdTimeMinMinutes
          );
          const holdMax = Number(
            analysis?.holdTimeMaxMinutes ?? position.holdTimeMaxMinutes
          );

          const confidence = Number(analysis?.confidence);
          const confidenceDelta = Number(analysis?.confidenceDelta);
          const health = healthState(analysis, pnlPercent);

          const tpDistance = distancePercent(current, takeProfit, side, "TP");
          const slDistance = distancePercent(current, stopLoss, side, "SL");

          const recommendation = String(
            analysis?.recommendation || "WATCH"
          ).toUpperCase();

          const recommendationClass =
            recommendation === "EXIT_CONSIDERATION"
              ? "negative"
              : recommendation === "REDUCE_RISK"
                ? "warning"
                : "positive";

          const engineScore = Number(position.engineScore);
          const positionRsi = Number(position.rsi);
          const volumeRatio = Number(position.volumeRatio);
          const marketConfidence = Number(position.marketConfidence);
          const marketRiskReward = Number(position.marketRiskReward);

          const healthChecks = [
            {
              label: "Engine score",
              value: Number.isFinite(engineScore) ? Math.round(engineScore) + "/100" : "—",
              state: Number.isFinite(engineScore) ? (engineScore >= 75 ? "PASS" : "WARN") : "UNKNOWN",
            },
            {
              label: "Market confidence",
              value: Number.isFinite(marketConfidence) ? Math.round(marketConfidence) + "%" : "—",
              state: Number.isFinite(marketConfidence) ? (marketConfidence >= 80 ? "PASS" : "WARN") : "UNKNOWN",
            },
            {
              label: "Risk / Reward",
              value: Number.isFinite(marketRiskReward) ? marketRiskReward.toFixed(1) + ":1" : "—",
              state: Number.isFinite(marketRiskReward) ? (marketRiskReward >= 2 ? "PASS" : "WARN") : "UNKNOWN",
            },
            {
              label: "RSI",
              value: Number.isFinite(positionRsi) ? positionRsi.toFixed(1) : "—",
              state: Number.isFinite(positionRsi) ? (positionRsi >= 35 && positionRsi <= 70 ? "PASS" : "WARN") : "UNKNOWN",
            },
            {
              label: "Volume",
              value: Number.isFinite(volumeRatio) ? volumeRatio.toFixed(2) + "x" : "—",
              state: Number.isFinite(volumeRatio) ? (volumeRatio >= 0.8 ? "PASS" : "WARN") : "UNKNOWN",
            },
          ];

          return (
            <div className="panel pos" key={key}>
              <div className="head">
                <div className="pair">
                  <div className="coin">
                    {String(position.symbol || "?").charAt(0)}
                  </div>
                  <div>
                    <b>{symbol || "Unknown"}</b>
                    <small>
                      {isTracked
                        ? "Manual Pionex purchase · AI monitoring"
                        : "Pionex live position · AI monitoring"}
                    </small>
                  </div>
                </div>

                <span className={side === "SHORT" ? "short" : "long"}>
                  <TrendingUp/>
                  {side}
                </span>
              </div>

              <div className="levels">
                {[
                  ["ENTRY",formatPrice(entry)],
                  ["CURRENT",formatPrice(current)],
                  ["UNREALIZED PNL",formatPnl(pnl)],
                  [pnlPercentType,pnlPercent !== null ? formatPercent(pnlPercent) : "—"]
                ].map((x,i) =>
                  <div
                    className={i >= 2 && Number.isFinite(pnl) && pnl < 0 ? "danger" : ""}
                    key={x[0]}
                  >
                    <small>{x[0]}</small>
                    <b>{x[1]}</b>
                  </div>
                )}
              </div>

              {(Number.isFinite(stopLoss) || Number.isFinite(takeProfit)) && (
                <div className="levels">
                  {[
                    ["STOP LOSS",formatPrice(stopLoss)],
                    ["TAKE PROFIT",formatPrice(takeProfit)],
                    ["DIST. TO SL",slDistance !== null ? formatPercent(slDistance) : "—"],
                    ["DIST. TO TP",tpDistance !== null ? formatPercent(tpDistance) : "—"]
                  ].map((x,i) =>
                    <div
                      className={
                        x[0] === "DIST. TO SL" && slDistance !== null && slDistance <= 0
                          ? "danger"
                          : x[0] === "DIST. TO TP" && tpDistance !== null && tpDistance <= 0
                            ? "danger"
                            : ""
                      }
                      key={x[0]}
                    >
                      <small>{x[0]}</small>
                      <b>{x[1]}</b>
                    </div>
                  )}
                </div>
              )}

              <div className="meta">
                <span>
                  <Radio/>
                  Quantity
                  <b>
                    {Number.isFinite(Number(position.quantity))
                      ? position.quantity
                      : "—"}
                  </b>
                </span>
                <span>
                  Source
                  <b>{isTracked ? "TRACKED" : "PIONEX"}</b>
                </span>
                <span>Mode <b>READ ONLY</b></span>
              </div>

              <div className="panel" style={{marginTop:"18px",padding:"18px"}}>
                <h3><BrainCircuit/> AI POSITION MONITORING</h3>

                {analysis?.exitWarning ? (
                  <div
                    className="metric"
                    style={{
                      marginBottom: "12px",
                      border: "1px solid rgba(255,90,90,.35)",
                      background: "rgba(255,70,70,.08)",
                    }}
                  >
                    <span>EXIT WARNING</span>
                    <b style={{color:"#ff7777"}}>
                      {recommendation === "EXIT_CONSIDERATION"
                        ? "AI EXIT CONSIDERATION"
                        : recommendation === "REDUCE_RISK"
                          ? "REDUCE RISK"
                          : "AI CONFIDENCE WEAKENING"}
                    </b>
                  </div>
                ) : null}

                {analysisLoading ? (
                  <div className="metric">
                    <span>AI analysis</span>
                    <b>ANALYZING...</b>
                  </div>
                ) : analysis ? (
                  <>
                    <div className="metric">
                      <span>AI STATUS</span>
                      <b className={recommendation === "WAITING" ? "neutral" : recommendationClass}>
                        {recommendation.replace(/_/g," ")}
                      </b>
                    </div>

                    <div className="metric">
                      <span>POSITION HEALTH</span>
                      <b className={health.className}>{health.label}</b>
                    </div>

                    <div className="metric">
                      <span>AI Confidence</span>
                      <b>
                        {Number.isFinite(confidence) ? confidence + "%" : "—"}
                        {Number.isFinite(confidenceDelta) ? (
                          <small style={{marginLeft:"8px"}}>
                            {confidenceDelta >= 0 ? "↑" : "↓"} {confidenceDelta >= 0 ? "+" : ""}{confidenceDelta.toFixed(0)}
                          </small>
                        ) : null}
                      </b>
                    </div>

                    <div className="metric">
                      <span>Risk</span>
                      <b>{analysis.riskLevel || "—"}</b>
                    </div>

                    <div className="metric">
                      <span>Estimated hold time</span>
                      <b>
                        {Number.isFinite(holdMin) && holdMin > 0
                          ? holdMin + "–" + (Number.isFinite(holdMax) && holdMax > 0 ? holdMax : holdMin) + " min"
                          : "—"}
                      </b>
                    </div>

                    <div
                      className="meta"
                      style={{
                        marginTop:"10px",
                        display:"grid",
                        gridTemplateColumns:"repeat(2,minmax(0,1fr))",
                        gap:"8px"
                      }}
                    >
                      {healthChecks.map(check => (
                        <span key={check.label}>
                          {check.state === "PASS" ? "✓" : check.state === "WARN" ? "⚠" : "•"} {check.label}
                          <b>{check.value}</b>
                        </span>
                      ))}
                    </div>

                    <div className="meta" style={{marginTop:"10px"}}>
                      <span>
                        Last AI analysis
                        <b>{formatTime(analysis.analyzedAt)}</b>
                      </span>
                      <span>
                        AI analysis age
                        <b>
                          {Number.isFinite(Number(analysis.analysisAgeSeconds))
                            ? Number(analysis.analysisAgeSeconds) < 60
                              ? Number(analysis.analysisAgeSeconds) + "s"
                              : Math.floor(Number(analysis.analysisAgeSeconds) / 60) + "m"
                            : "—"}
                          {analysis.analysisFresh === false && analysis.analyzedAt ? " · STALE" : ""}
                        </b>
                      </span>
                      <span>
                        Market data age
                        <b>
                          {(() => {
                            const stamp = position.marketUpdatedAt || marketSnapshot?.updatedAt || marketSnapshot?.persistedAt;
                            const ts = stamp ? new Date(stamp).getTime() : NaN;
                            if (!Number.isFinite(ts)) return "—";
                            const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
                            return seconds < 60 ? seconds + "s" : Math.floor(seconds / 60) + "m";
                          })()}
                        </b>
                      </span>
                      <span>
                        Provider
                        <b>{analysis.provider || "—"}</b>
                      </span>
                      <span>
                        Cycle
                        <b>~7 min</b>
                      </span>
                    </div>

                    <p>{analysis.reasoning || "No reasoning returned."}</p>
                    <small className="note">
                      {analysis.action || ""}
                      {analysis.holdTimeReason ? " " + analysis.holdTimeReason : ""}
                    </small>
                  </>
                ) : (
                  <p>
                    AI analysis has not returned yet.
                    {isTracked
                      ? " The tracked manual purchase is already in the monitoring queue."
                      : ""}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </>;
}


createRoot(
  document.getElementById("root")
).render(
  <App />
);

