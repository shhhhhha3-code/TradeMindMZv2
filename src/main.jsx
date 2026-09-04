import './ui/trademind-design.css';
import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{Activity,BrainCircuit,ChevronRight,History,LayoutDashboard,LineChart,Menu,Bell,RefreshCw,Settings,ShieldCheck,Target,TrendingUp,Wallet,X,Zap,Radio}from'lucide-react';import'./styles.css';
import { useLiveAiSignal } from "./services/useLiveAiSignal.js";
import ManualPurchaseModal from "./components/ManualPurchaseModal";
import { loadTrackedPositions } from "./positions/positionStorage.js";
import { registerManualPurchase } from "./positions/workflowIndex.js";
import { fetchLivePositions } from "./services/livePositionService.js";
import { analyzePositionWithAI } from "./services/positionAiService.js";
import { fetchLearningStats } from "./services/learningStatsService.js";
import { fetchSignalHistory } from "./services/signalHistoryService.js";
import { fetchDashboardData } from "./services/dashboardService.js";
function Logo(){return <div className="brand"><div className="logo"><i/><i/><b/></div><div><strong>TRADEMIND<span>MZ</span></strong><small>AI MARKET INTELLIGENCE</small></div></div>}
function Ring({score}){return <div className="ring" style={{'--p':score*3.6+'deg'}}><div><b>{score}</b><small>AI SCORE</small></div></div>}

function App(){
const[tab,setTab]=useState('signals'),[bought,setBought]=useState(false),[manualPurchaseOpen,setManualPurchaseOpen]=useState(false),[trackedPositions,setTrackedPositions]=useState(()=>loadTrackedPositions()),[open,setOpen]=useState(false),[purchaseDefaults,setPurchaseDefaults]=useState({symbol:"BTCUSDT",side:"LONG",entryPrice:0,stopLoss:0,takeProfit:0}),[aiSettings,setAiSettings]=useState(()=>{try{return JSON.parse(localStorage.getItem('trademindmz-ai-settings'))||{ai:true,openai:true,groq:true,learning:true}}catch{return{ai:true,openai:true,groq:true,learning:true}}});const handleManualPurchase=(purchase)=>{
  const result=registerManualPurchase(purchase);

  if(!result?.success){
    throw new Error(result?.error||"Unable to register Pionex purchase.");
  }

  setTrackedPositions(loadTrackedPositions());
  setBought(true);
  setManualPurchaseOpen(false);
  setTab('positions');

  window.dispatchEvent(
    new Event('trademindmz-position-updated')
  );

  return result;
};

const updateAiSetting=(key,value)=>{const next={...aiSettings,[key]:value};setAiSettings(next);localStorage.setItem('trademindmz-ai-settings',JSON.stringify(next));};const nav=[['dashboard','Dashboard',LayoutDashboard],['signals','AI Signals',BrainCircuit],['positions','Live Positions',Activity],['market','Market Overview',LineChart],['history','Signal History',History]];return <div className="app"><aside className={open?'side open':'side'}><div className="sidehead"><Logo/><button onClick={()=>setOpen(false)}><X/></button></div><div className="online"><i/> <div><b>AI ENGINE ONLINE</b><small>Learning from market history</small></div></div><nav>{nav.map(([id,label,I])=><button className={tab===id?'active':''} onClick={()=>{setTab(id);setOpen(false)}} key={id}><I/><span>{label}</span>{id==='positions'&&<em>{trackedPositions.filter(p=>p.status==='LIVE').length}</em>}</button>)}</nav><div className="bottom"><button><ShieldCheck/><span>Pionex Connection</span><i/></button><button onClick={()=>{setTab('settings');setOpen(false)}}><Settings/><span>Settings</span></button></div></aside>{open&&<div className="back" onClick={()=>setOpen(false)}/>}
<main><header><button className="hamb" onClick={()=>setOpen(true)}><Menu/></button><div className="mobilelogo"><Logo/></div><div className="title"><small>TRADEMINDMZ</small><b>{tab==='signals'?'AI Signals':tab==='positions'?'Live Positions':tab==='market'?'Market Overview':tab==='history'?'Signal History':tab==='settings'?'Settings':'Dashboard'}</b></div><div className="actions"><span className="live"><i/> AI LIVE</span><button className="bell"><Bell/></button><button className="avatar">MZ</button></div></header><section>
{tab==='signals'
  ? <Signals bought={bought} setBought={setBought} setManualPurchaseOpen={setManualPurchaseOpen} setPurchaseDefaults={setPurchaseDefaults}/>
  : tab==='positions'
    ? <Positions/>
    : tab==='settings'
      ? <SettingsPage settings={aiSettings} updateSetting={updateAiSetting}/>
      : tab==='dashboard'
        ? <Dashboard/>
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
                    {recommendation.score ?? "—"}
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

      const response = await fetch(
        "/api/pionex/wallet-balances"
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

        fetch(
          "/api/pionex/wallet-balances"
        ).then(async response => {
          if (!response.ok) {
            throw new Error(
              `Wallet request failed (${response.status})`
            );
          }

          return response.json();
        }),

        fetch(
          "/api/pionex/market-scan?limit=100&maxMarkets=5"
        ).then(async response => {
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
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [error,setError] = useState("");

  const loadMarkets = async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const response = await fetch(
        "/api/pionex/market-scan?scanLimit=15&maxMarkets=15"
      );

      const text = await response.text();

      if (!response.ok) {
        throw new Error(
          `Market API returned HTTP ${response.status}`
        );
      }

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          "Market API returned invalid JSON."
        );
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
          "Market data could not be loaded."
        );
      }

      setMarkets(
        Array.isArray(data.candidates)
          ? data.candidates
          : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load market data."
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
            Showing {markets.length} live Pionex markets ·
            auto-refresh every 60 seconds
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

      setHistory(
        Array.isArray(result?.history)
          ? result.history
          : []
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
          TradeMindMZ stores AI signal and
          position-analysis results in Supabase.
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
              "WATCH"
            ).replace(
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
  </>
}


function DiagnosticsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const runDiagnostics = async () => {
    setRunning(true);

    try {
      const response =
        await fetch("/api/diagnostics", {
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
                  "Backend" &&
                  "Express API responding normally."}
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
          await fetch(
            "/api/ai/trade-criteria",
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
          await fetch(
            "/api/ai/trade-criteria",
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

  const [learningStats,setLearningStats] = useState(null);
  const [learningError,setLearningError] = useState("");

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

    return () => {
      active = false;
    };
  }, []);

  const {
    data,
    loading,
    refreshing,
    error,
    refresh
  } = useLiveAiSignal({
    scanLimit: 100,
    maxMarkets: 25,
    preferredProvider: "groq"
  });

  const recommended = data?.recommended || null;

  const symbolRaw = String(recommended?.symbol || "—");
  const displaySymbol = symbolRaw.includes("_")
    ? symbolRaw.replace("_"," / ")
    : symbolRaw.replace("USDT"," / USDT");

  const directionRaw = String(
    recommended?.direction || "NO_TRADE"
  ).toUpperCase();

  const direction =
    directionRaw === "BUY" ? "LONG" :
    directionRaw === "SELL" ? "SHORT" :
    "WATCH";

  const score =
    Number.isFinite(Number(recommended?.score))
      ? Number(recommended.score)
      : 0;

  const confidence =
    Number.isFinite(Number(recommended?.confidence))
      ? Number(recommended.confidence)
      : 0;

  const entry =
    Number.isFinite(Number(recommended?.entry))
      ? Number(recommended.entry)
      : 0;

  const stop =
    Number.isFinite(Number(recommended?.stopLoss))
      ? Number(recommended.stopLoss)
      : 0;

  const tp =
    Number.isFinite(Number(recommended?.takeProfit))
      ? Number(recommended.takeProfit)
      : 0;

  const rr =
    Number.isFinite(Number(recommended?.riskReward))
      ? Number(recommended.riskReward)
      : 0;

  const risk = String(
    recommended?.riskLevel || "—"
  ).toUpperCase();

  const reasoning =
    recommended?.reasoning ||
    data?.summary ||
    "Awaiting live Pionex market analysis.";

  const technicalSource =
    data?.candidates?.find(
      candidate =>
        candidate?.symbol ===
        recommended?.symbol
    ) || {};

  const ema9 =
    Number(technicalSource?.ema9);

  const ema21 =
    Number(technicalSource?.ema21);

  const rsi =
    Number(technicalSource?.rsi);

  const macd =
    Number(technicalSource?.macd);

  const atrPercent =
    Number(
      technicalSource?.atrPercent ??
      technicalSource?.atrPct
    );

  const volumeRatio =
    Number(
      technicalSource?.volumeRatio
    );

  const change24h =
    Number(
      technicalSource?.change24h
    );

  const technicalMetrics = [
    [
      "EMA trend",
      Number.isFinite(ema9) &&
      Number.isFinite(ema21)
        ? ema9 > ema21
          ? "Bullish"
          : "Bearish"
        : "—"
    ],
    [
      "RSI",
      Number.isFinite(rsi)
        ? rsi.toFixed(1)
        : "—"
    ],
    [
      "MACD",
      Number.isFinite(macd)
        ? macd.toFixed(4)
        : "—"
    ],
    [
      "ATR",
      Number.isFinite(atrPercent)
        ? `${atrPercent.toFixed(2)}%`
        : "—"
    ],
    [
      "Volume ratio",
      Number.isFinite(volumeRatio)
        ? volumeRatio.toFixed(2)
        : "—"
    ],
    [
      "24h change",
      Number.isFinite(change24h)
        ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`
        : "—"
    ]
  ];

  const verdict =
    String(data?.verdict || "NO_TRADE")
      .replace("_"," ");

  const comparison = Array.isArray(data?.comparison)
    ? data.comparison
    : [];

  const signalCriteria =
    data?.criteria || null;

  const signalBestCandidate =
    signalCriteria?.bestCandidate || null;

  const signalFailedChecks =
    Array.isArray(
      signalCriteria?.failedChecks
    )
      ? signalCriteria.failedChecks
      : [];

  const signalPassedChecks =
    Array.isArray(
      signalCriteria?.checks
    )
      ? signalCriteria.checks.filter(
          check => check.passed
        )
      : [];


  const formatPrice = value => {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      return "—";
    }

    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(number);
  };

  const handlePurchase = () => {
    if (!recommended) return;

    setPurchaseDefaults({
      symbol: symbolRaw.replace("_",""),
      side: direction,
      entryPrice: entry,
      stopLoss: stop,
      takeProfit: tp
    });

    setManualPurchaseOpen(true);
  };

  return <>
    <div className="hero">
      <div>
        <label><Zap/> BEST RECOMMENDED SIGNAL</label>
        <h1>
          {loading
            ? "AI is scanning the live market."
            : recommended
              ? "AI has found the strongest setup."
              : "No trade recommendation yet."}
        </h1>

        <p>
          {error
            ? error
            : `Pionex TOP 5 compared by ${data?.provider || "AI"}.
               Analysis only. No automatic trading.`}
        </p>
      </div>

      <button
        className="refresh"
        onClick={refresh}
        disabled={loading || refreshing}
      >
        <RefreshCw className={refreshing ? "spin" : ""}/>
        {refreshing ? " Scanning..." : " Refresh analysis"}
      </button>
    </div>

    <div className="grid">
      <div className="panel main">

        <div className="head">
          <div className="pair">
            <div className="coin">
              {symbolRaw.startsWith("BTC") ? "₿" : symbolRaw.charAt(0) || "?"}
            </div>

            <div>
              <b>{displaySymbol}</b>
              <small>
                {loading
                  ? "Scanning Pionex..."
                  : `Pionex MARKET → ${String(data?.provider || "AI").toUpperCase()} AI`}
              </small>
            </div>
          </div>

          <span className="long">
            <TrendingUp/>
            {direction}
          </span>
        </div>

        <div className="core">
          <Ring score={score}/>

          <div className="copy">
            <div>
              <small>AI CONFIDENCE</small>
              <b>{confidence}%</b>
            </div>

            <div className="meter">
              <i style={{width:confidence+"%"}}/>
            </div>

            <p>
              {reasoning}
            </p>
          </div>
        </div>

        <div className="levels">
          {[
            ["ENTRY",formatPrice(entry)],
            ["TAKE PROFIT",formatPrice(tp)],
            ["", ""],
            ["STOP LOSS",formatPrice(stop)]
          ].map((x,i)=>
            <div className={i===3?"danger":""} key={`${x[0]}-${i}`}>
              <small>{x[0]}</small>
              <b>{x[1]}</b>
            </div>
          )}
        </div>

        <div className="meta">
          <span>
            <Target/>
            R/R <b>{rr ? `1 : ${rr}` : "—"}</b>
          </span>

          <span>
            <History/>
            AI verdict <b>{verdict}</b>
          </span>

          <span>
            Risk <b>{risk}</b>
          </span>
        </div>

        <button
          className={bought?"buy done":"buy"}
          onClick={handlePurchase}
          disabled={!recommended || loading}
        >
          {bought
            ? <><ShieldCheck/> PURCHASE REGISTERED IN PIONEX</>
            : <><Wallet/> I BOUGHT THIS IN PIONEX</>}
        </button>

        <small className="note">
          Records your manual Pionex purchase.
          TradeMindMZ does not place orders.
        </small>
      </div>

      <div className="stack">

  
      {data?.verdict === "NO_TRADE" && (
        <div
          className="panel"
          style={{
            marginBottom: "18px",
            padding: "20px"
          }}
        >
          <div
            className="settinghead"
            style={{
              alignItems: "flex-start"
            }}
          >
            <div>
              <h3>
                <Target/>
                SIGNAL TRADE CRITERIA
              </h3>

              <p>
                Hard TradeMindMZ criteria used
                before a signal can be recommended.
              </p>
            </div>

            <span className="status">
              <i/>
              NO TRADE
            </span>
          </div>

          {signalBestCandidate && (
            <div
              style={{
                marginTop: "16px",
                padding: "14px",
                borderRadius: "10px",
                border:
                  "1px solid rgba(255,255,255,.08)",
                background:
                  "rgba(255,255,255,.02)"
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: ".12em",
                  color:
                    "rgba(255,255,255,.4)"
                }}
              >
                Best candidate
              </div>

              <div
                style={{
                  marginTop: "4px",
                  fontSize: "20px",
                  fontWeight: 700
                }}
              >
                {signalBestCandidate.symbol}
              </div>

              <div
                style={{
                  marginTop: "3px",
                  fontSize: "12px",
                  color:
                    "rgba(255,255,255,.45)"
                }}
              >
                {signalBestCandidate.direction}
              </div>
            </div>
          )}

          <div
            className="costgrid"
            style={{
              marginTop: "16px"
            }}
          >

            {signalCriteria?.checks?.map(
              check => (
                <span key={check.key}>
                  <b
                    style={{
                      color: check.passed
                        ? "#35e0a1"
                        : "#ff6b6b"
                    }}
                  >
                    {check.passed
                      ? "PASS"
                      : "FAIL"}
                  </b>

                  <small>
                    {check.label}:{" "}
                    {String(
                      check.actual ??
                      "—"
                    )}
                    {" / "}
                    {String(
                      check.target ??
                      "—"
                    )}
                  </small>
                </span>
              )
            )}

          </div>

          {signalFailedChecks.length > 0 && (
            <div
              style={{
                marginTop: "16px",
                paddingTop: "14px",
                borderTop:
                  "1px solid rgba(255,255,255,.06)"
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: ".12em",
                  color: "#ff6b6b"
                }}
              >
                Why no trade?
              </div>

              <div
                style={{
                  marginTop: "7px",
                  fontSize: "13px",
                  color:
                    "rgba(255,255,255,.65)"
                }}
              >
                {signalFailedChecks
                  .map(
                    check =>
                      `${check.label}: ${check.actual ?? "—"} (required ${check.target ?? "—"})`
                  )
                  .join(" • ")}
              </div>
            </div>
          )}

          {signalFailedChecks.length === 1 && (
            <div
              style={{
                marginTop: "12px",
                fontSize: "12px",
                color:
                  "rgba(255,255,255,.4)"
              }}
            >
              All other hard criteria passed.
            </div>
          )}

        </div>
      )}

      <div className="panel">
          <h3><BrainCircuit/> WHY AI LIKES IT</h3>

          {[
            [
              "AI provider",
              data?.provider || "—"
            ],
            [
              "AI score",
              score ? String(score) : "—"
            ],
            [
              "Confidence",
              confidence ? `${confidence}%` : "—"
            ],
            [
              "Risk",
              risk
            ],
            [
              "Verdict",
              verdict
            ]
          ].map(x=>
            <div className="metric" key={x[0]}>
              <span>{x[0]}</span>
              <b>{x[1]}</b>
            </div>
          )}

          <h3 style={{marginTop:"20px"}}>
            <LineChart/> TECHNICAL DATA
          </h3>

          {technicalMetrics.map(x=>
            <div
              className="metric"
              key={x[0]}
            >
              <span>{x[0]}</span>
              <b>{x[1]}</b>
            </div>
          )}
        </div>

        <div className="panel">
          <h3><History/> AI LEARNING</h3>

          <strong className="big">
            {learningStats?.totalAnalyses ?? "—"}
          </strong>

          <p>
            AI position analyses stored
          </p>

          {learningError && (
            <small className="note">
              {learningError}
            </small>
          )}

          <div className="mini">
            <span>
              <b>
                {learningStats?.averageConfidence != null
                  ? `${learningStats.averageConfidence}%`
                  : "—"}
              </b>
              <small>avg confidence</small>
            </span>

            <span>
              <b>
                {learningStats
                  ? (
                      learningStats.recommendations?.WATCH || 0
                    )
                  : "—"}
              </b>
              <small>WATCH analyses</small>
            </span>
          </div>
        </div>

      </div>
    </div>

    <div className="section">
      <h2>Other AI Opportunities</h2>
      <button onClick={refresh}>
        View all <ChevronRight/>
      </button>
    </div>

    <div className="opps">
      {(comparison.length
        ? comparison.filter(x => x.symbol !== symbolRaw).slice(0,3)
        : []
      ).map((x)=>
        <div className="panel opp" key={x.symbol}>
          <div>
            <b>{String(x.symbol || "").replace("_"," / ")}</b>
            <span>WATCH</span>
          </div>

          <strong>
            {x.score}
            <small> AI SCORE</small>
          </strong>

          <p>
            {x.assessment || "Compared by AI."}
          </p>
        </div>
      )}

      {!comparison.length && (
        <div className="panel opp">
          <div>
            <b>Waiting for market scan</b>
            <span>LIVE</span>
          </div>

          <strong>
            —
            <small> AI SCORE</small>
          </strong>

          <p>
            Refresh analysis to load the current Pionex TOP 5.
          </p>
        </div>
      )}
    </div>
  </>
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

  const loadPositions = async () => {
    setRefreshing(true);
    setError("");

    try {
      const result = await fetchLivePositions();

      const nextPositions =
        Array.isArray(result.positions)
          ? result.positions
          : [];

      setPositions(nextPositions);

      if (nextPositions.length) {
        for (const position of nextPositions) {
          const key = String(
            position.id ||
            position.symbol
          );

          if (ai[key]) {
            continue;
          }

          try {
            setAiLoading(prev => ({
              ...prev,
              [key]: true
            }));

            const symbolForMarket =
              String(position.symbol || "")
                .trim();

            let market = {};

            try {
              const marketResponse = await fetch(
                `/api/pionex/market-scan?limit=100&maxMarkets=25`
              );

              if (marketResponse.ok) {
                const marketData =
                  await marketResponse.json();

                const candidates =
                  Array.isArray(
                    marketData?.candidates
                  )
                    ? marketData.candidates
                    : [];

                const matching =
                  candidates.find(
                    candidate =>
                      candidate?.symbol ===
                      symbolForMarket
                  );

                if (matching) {
                  market = matching;
                }
              }
            } catch (marketError) {
              console.warn(
                "Market data unavailable for position AI:",
                marketError
              );
            }

            const result =
              await analyzePositionWithAI(
                position,
                market
              );

            if (result?.success && result?.analysis) {
              setAi(prev => ({
                ...prev,
                [key]: {
                  ...result.analysis,
                  provider:
                    result.provider ||
                    "groq",
                  historySaved:
                    result.historySaved === true,
                  historyId:
                    result.historyId ||
                    null
                }
              }));
            }
          } catch (analysisError) {
            console.error(
              "Position AI analysis failed:",
              analysisError
            );
          } finally {
            setAiLoading(prev => ({
              ...prev,
              [key]: false
            }));
          }
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load Pionex positions."
      );
      setPositions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPositions();

    const timer = setInterval(() => {
      setAi({});
      loadPositions();
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  const formatPrice = value => {
    const number = Number(value);

    if (
      !Number.isFinite(number) ||
      number <= 0
    ) {
      return "—";
    }

    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(number);
  };

  const formatPnl = value => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return `${number >= 0 ? "+" : ""}${number.toFixed(2)}`;
  };

  return <>
    <div className="hero">
      <div>
        <label>
          <Radio/> PIONEX LIVE POSITIONS
        </label>

        <h1>
          AI watches what you actually bought.
        </h1>

        <p>
          Live positions are read directly from
          your Pionex account. AI provides risk
          guidance only and never executes trades.
        </p>
      </div>

      <button
        className="refresh"
        onClick={() => {
          setAi({});
          loadPositions();
        }}
        disabled={refreshing}
      >
        <RefreshCw
          className={refreshing ? "spin" : ""}
        />
        {refreshing
          ? " Refreshing..."
          : " Refresh positions"}
      </button>
    </div>

    {error ? (
      <div className="panel" style={{padding:"24px"}}>
        <div className="live-position-empty">
          <ShieldCheck size={28}/>
          <h3>
            Unable to load Pionex positions
          </h3>
          <p>{error}</p>
        </div>
      </div>
    ) : loading ? (
      <div className="panel" style={{padding:"30px"}}>
        <div className="live-position-empty">
          <Radio size={28}/>
          <h3>
            Loading Pionex positions...
          </h3>
          <p>
            Reading your account in read-only mode.
          </p>
        </div>
      </div>
    ) : !positions.length ? (
      <div className="panel" style={{padding:"30px"}}>
        <div className="live-position-empty">
          <ShieldCheck size={28}/>
          <h3>No live positions detected</h3>
          <p>
            Pionex currently reports no open
            positions.
          </p>
        </div>
      </div>
    ) : (
      <div className="positions">

        {positions.map(position => {

          const symbol =
            String(position.symbol || "")
              .replace("_USDT"," / USDT")
              .replace("USDT"," / USDT");

          const entry =
            Number(position.entryPrice);

          const current =
            Number(position.currentPrice);

          let pnlPercent = 0;

          if (
            Number.isFinite(entry) &&
            Number.isFinite(current) &&
            entry > 0
          ) {
            pnlPercent =
              position.side === "SHORT"
                ? ((entry-current)/entry)*100
                : ((current-entry)/entry)*100;
          }

          const pnl =
            Number(position.unrealizedPnl);

          const key = String(
            position.id ||
            position.symbol
          );

          const analysis = ai[key];
          const analysisLoading =
            Boolean(aiLoading[key]);

          return (
            <div
              className="panel pos"
              key={key}
            >

              <div className="head">
                <div className="pair">
                  <div className="coin">
                    {String(
                      position.symbol || "?"
                    ).charAt(0)}
                  </div>

                  <div>
                    <b>
                      {symbol || "Unknown"}
                    </b>

                    <small>
                      Pionex live position
                    </small>
                  </div>
                </div>

                <span className="long">
                  <TrendingUp/>
                  {position.side}
                </span>
              </div>

              <div className="levels">
                {[
                  ["ENTRY",formatPrice(entry)],
                  ["CURRENT",formatPrice(current)],
                  [
                    "UNREALIZED PNL",
                    formatPnl(pnl)
                  ],
                  [
                    "PNL %",
                    `${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}%`
                  ]
                ].map((x,i)=>
                  <div
                    className={
                      i >= 2 && pnl < 0
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

              <div className="meta">
                <span>
                  <Radio/>
                  Quantity
                  <b>
                    {Number.isFinite(
                      Number(position.quantity)
                    )
                      ? position.quantity
                      : "—"}
                  </b>
                </span>

                <span>
                  Source
                  <b>PIONEX</b>
                </span>

                <span>
                  Mode
                  <b>READ ONLY</b>
                </span>
              </div>

              <div
                className="panel"
                style={{
                  marginTop:"18px",
                  padding:"18px"
                }}
              >
                <h3>
                  <BrainCircuit/>
                  AI POSITION RISK
                </h3>

                {analysisLoading ? (
                  <div className="metric">
                    <span>
                      AI analysis
                    </span>
                    <b>
                      ANALYZING...
                    </b>
                  </div>
                ) : analysis ? (
                  <>
                    <div className="metric">
                      <span>
                        Recommendation
                      </span>
                      <b>
                        {String(
                          analysis.recommendation ||
                          "WATCH"
                        ).replace(
                          /_/g,
                          " "
                        )}
                      </b>
                    </div>

                    <div className="metric">
                      <span>
                        Risk
                      </span>
                      <b>
                        {analysis.riskLevel}
                      </b>
                    </div>

                    <div className="metric">
                      <span>
                        AI Confidence
                      </span>
                      <b>
                        {analysis.confidence}%
                      </b>
                    </div>

                    <p>
                      {analysis.reasoning}
                    </p>

                    <small className="note">
                      {analysis.action}
                    </small>
                  </>
                ) : (
                  <p>
                    Waiting for AI position
                    analysis.
                  </p>
                )}
              </div>

            </div>
          );
        })}
      </div>
    )}
  </>
}

createRoot(
  document.getElementById("root")
).render(
  <App />
);

