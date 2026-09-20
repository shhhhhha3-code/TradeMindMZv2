import { apiUrl } from "../services/apiBase.js";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Wallet } from "lucide-react";
import TradingModeToggle from "./TradingModeToggle.jsx";
import ServerPerformancePanel from "./ServerPerformancePanel.jsx";

import CoinLogo from "./CoinLogo.jsx";
import MarketSparkline from "./MarketSparkline.jsx";
import { useLiveAiSignal } from "../services/useLiveAiSignal.js";

function number(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n
    : fallback;
}

function formatPrice(value) {
  const n = number(value);

  if (n === null) return "—";

  if (n >= 1000) {
    return n.toLocaleString(
      "en-US",
      {
        maximumFractionDigits: 2,
      }
    );
  }

  if (n >= 1) {
    return n.toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }
    );
  }

  if (n >= 0.01) {
    return n.toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 3,
        maximumFractionDigits: 5,
      }
    );
  }

  return n.toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 6,
      maximumFractionDigits: 8,
    }
  );
}

function formatPct(value) {
  const n = number(value);

  if (n === null) return "—";

  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function directionClass(value) {
  const n = number(value, 0);

  return n >= 0
    ? "tmz-positive"
    : "tmz-negative";
}

function toBaseSymbol(symbol = "") {
  return String(symbol)
    .toUpperCase()
    .replace(/[_-].*$/, "")
    .replace(/USDT.*$/, "")
    .replace(/USDC.*$/, "")
    .replace(/USD.*$/, "");
}

function normalizePionexCandidates(
  candidates = []
) {
  return candidates
    .filter(Boolean)
    .slice(0, 5)
    .map((candidate, index) => {
      const symbol =
        candidate.symbol ||
        candidate.market ||
        `COIN_${index + 1}`;

      return {
        ...candidate,
        symbol,
        baseSymbol:
          toBaseSymbol(symbol),
        price:
          number(
            candidate.price ??
            candidate.entry ??
            candidate.lastPrice
          ),
        change24h:
          number(
            candidate.change24h ??
            candidate?.indicators?.change24h
          ),
        score:
          number(
            candidate.score ??
            candidate.engineScore
          ),
        confidence:
          number(
            candidate.confidence
          ),
        riskReward:
          number(
            candidate.riskReward
          ),
        sparkline:
          Array.isArray(
            candidate.sparkline
          )
            ? candidate.sparkline
            : [],
        source:
          candidate.source ||
          "PIONEX",
      };
    });
}

export default function ProDashboard({ onSelectTrade = null }) {
  const [marketType, setMarketType] = useState("PERP");
  const [spotHoldings, setSpotHoldings] = useState([]);
  const [spotHoldingsError, setSpotHoldingsError] = useState("");

  const liveAi = useLiveAiSignal({
    interval: "15M",
    maxMarkets: 25,
    preferredProvider: "groq",
    marketType,
  });

  const [
    data,
    setData
  ] = useState(null);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    refreshing,
    setRefreshing
  ] = useState(false);

  const [
    error,
    setError
  ] = useState("");

  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletRefreshing, setWalletRefreshing] = useState(false);
  const [walletError, setWalletError] = useState("");

  const syncLiveAiData = useCallback((result) => {
    if (!result) return;

    const rawCandidates = Array.isArray(result?.candidates)
      ? result.candidates
      : Array.isArray(result?.engineTop5)
        ? result.engineTop5
        : [];

    setData({
      mode: "PIONEX",
      source: result?.contractType || (marketType === "SPOT" ? "PIONEX SPOT" : "PIONEX USDT-M PERPETUAL"),
      delayed: false,
      updatedAt: result?.updatedAt || new Date().toISOString(),
      candidates: normalizePionexCandidates(rawCandidates),
      aiDecision: result?.aiDecision || null,
      finalDecision: result?.finalDecision || "NO_TRADE",
      marketRegime: result?.marketRegime || null,
      tradeQuality: result?.tradeQuality || null,
      whyNoTrade: result?.whyNoTrade || null,
      tradeExplanation: result?.tradeExplanation || result?.aiDecision?.tradeExplanation || null,
    });
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");

    try {
      const result = await liveAi.refresh();

      if (result) {
        syncLiveAiData(result);
      }

      if (liveAi.error) {
        setError(liveAi.error);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Market data unavailable."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [liveAi.refresh, liveAi.error, syncLiveAiData]);

  useEffect(() => {
    if (liveAi.data) {
      syncLiveAiData(liveAi.data);
      setError(liveAi.error || "");
      setLoading(false);
    }
  }, [liveAi.data, liveAi.error, syncLiveAiData]);

  const loadWallet = useCallback(async () => {
    setWalletRefreshing(true);
    setWalletError("");

    try {
      const response = await fetch(
        apiUrl("/api/pionex/wallet-balances"),
        {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok || result?.success !== true) {
        throw new Error(
          result?.error ||
          `Wallet request failed (${response.status})`
        );
      }

      setWallet(result);
    } catch (err) {
      setWalletError(
        err instanceof Error
          ? err.message
          : "Unable to load Pionex wallet."
      );
    } finally {
      setWalletLoading(false);
      setWalletRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();

    const timer =
      setInterval(
        load,
        60000
      );

    return () =>
      clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (marketType !== "SPOT") {
      setSpotHoldings([]);
      setSpotHoldingsError("");
      return undefined;
    }

    let active = true;
    const loadSpotHoldings = async () => {
      try {
        const response = await fetch(apiUrl("/api/ai/spot-monitoring"), {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok || result?.success !== true) {
          throw new Error(result?.error || "Spot holdings unavailable.");
        }
        if (active) {
          setSpotHoldings(Array.isArray(result.holdings) ? result.holdings : []);
          setSpotHoldingsError("");
        }
      } catch (error) {
        if (active) {
          setSpotHoldingsError(error instanceof Error ? error.message : "Spot holdings unavailable.");
        }
      }
    };

    loadSpotHoldings();
    const timer = setInterval(loadSpotHoldings, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [marketType]);

  useEffect(() => {
    loadWallet();

    const timer =
      setInterval(
        loadWallet,
        60000
      );

    return () =>
      clearInterval(timer);
  }, [loadWallet]);

  const selectBestTrade = useCallback(async () => {
    if (!onSelectTrade || refreshing || liveAi.refreshing) return;

    setError("");

    try {
      const fresh = await liveAi.refresh(true);

      if (!fresh) {
        setError(
          liveAi.error ||
          "Fresh trade analysis failed. No BUY/SELL signal was produced."
        );
        return;
      }

      const recommendation = fresh?.recommended || null;
      const directionRaw = String(
        recommendation?.direction || ""
      ).toUpperCase();

      const direction =
        directionRaw === "BUY" || directionRaw === "LONG"
          ? "BUY"
          : directionRaw === "SELL" || directionRaw === "SHORT"
            ? "SELL"
            : "";

      if (!recommendation || !direction) {
        setError(
          fresh?.aiDecision?.reason ||
          fresh?.summary ||
          "AI completed the fresh analysis but did not approve a BUY or SELL trade."
        );
        return;
      }

      onSelectTrade({
        ...recommendation,
        direction,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Fresh trade analysis unavailable."
      );
    }
  }, [
    liveAi.error,
    liveAi.refresh,
    liveAi.refreshing,
    onSelectTrade,
    refreshing,
  ]);

  const tradeAnalysisRefreshing =
    refreshing || liveAi.refreshing;

  const candidates =
    useMemo(
      () =>
        Array.isArray(
          data?.candidates
        )
          ? data.candidates.slice(0, 5)
          : [],
      [data]
    );

  const bestCandidate =
    candidates[0] || null;

  const positiveCount =
    candidates.filter(
      candidate =>
        number(
          candidate.change24h,
          0
        ) >= 0
    ).length;

  const liveAiDecision = liveAi?.data?.aiDecision || null;
  const liveAiFinalDecision = liveAi?.data?.finalDecision || null;

  const walletData = wallet?.data || {};
  const walletTotal = number(walletData?.totalInUsdt);
  const walletSpot = number(walletData?.botAccount?.totalInUsdt);
  const walletFutures = number(walletData?.traderAccount?.totalInUsdt);

  const formatUsdt = value => {
    const n = number(value);
    if (n === null) return "—";
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="tmz-dashboard">

      {/* =====================================================
          HERO
          ===================================================== */}

      <div className="tmz-dashboard-hero">

        <div>
          <div className="tmz-eyebrow">
            <span className="tmz-eyebrow-dot" />
            TRADEMINDMZ • COMMAND CENTER
          </div>

          <h1>
            TradeMind
            <span>MZ</span>
          </h1>

          <p>
            Live Pionex account, AI market intelligence
            and risk-first monitoring in read-only mode.
          </p>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap",justifyContent:"flex-end"}}>
          <TradingModeToggle value={marketType} onChange={setMarketType} />
          <button
            type="button"
            className="tmz-refresh"
            onClick={load}
            disabled={refreshing}
          >
          <span
            className={
              refreshing
                ? "tmz-spin"
                : ""
            }
          >
            ↻
          </span>
            {refreshing
              ? "Updating"
              : "Refresh"}
          </button>
        </div>

      </div>

      {/* =====================================================
          STATUS BAR
          ===================================================== */}

      <div className="tmz-statusbar">

        <div className="tmz-status-source">
          <span
            className={
              data?.mode === "PIONEX"
                ? "tmz-status-dot live"
                : data?.mode === "FALLBACK"
                  ? "tmz-status-dot fallback"
                  : "tmz-status-dot offline"
            }
          />

          <div>
            <strong>
              {data?.source ||
                "CONNECTING MARKET DATA"}
            </strong>

            <small>
              {data?.marketRegime?.regime ? "Market regime: " + data.marketRegime.regime + " • " : ""}
              {data?.mode === "PIONEX"
                ? "Live Pionex feed"
                : data?.mode === "FALLBACK"
                  ? "Pionex temporarily limited"
                  : data?.mode === "OFFLINE"
                    ? "Waiting for market feed"
                    : "Connecting…"}
            </small>
          </div>
        </div>

        <div className="tmz-status-item">
          <small>MARKETS</small>
          <strong>
            {candidates.length || "—"}
          </strong>
        </div>

        <div className="tmz-status-item">
          <small>POSITIVE</small>
          <strong>
            {candidates.length
              ? `${positiveCount}/${candidates.length}`
              : "—"}
          </strong>
        </div>

        <div className="tmz-status-item">
          <small>DECISION</small>
          <strong
            className={
              data?.finalDecision ===
              "NO_TRADE"
                ? "tmz-warning-text"
                : "tmz-positive"
            }
          >
            {liveAiFinalDecision || data?.finalDecision ||
              "—"}
          </strong>
        </div>

      </div>

      {/* =====================================================
          LIVE PIONEX BALANCE
          ===================================================== */}

      <div
        className="tmz-statusbar tmz-wallet-bar"
        style={{ marginBottom: "18px" }}
      >
        <div className="tmz-status-source">
          <Wallet size={20} />
          <div>
            <strong>PIONEX BALANCE</strong>
            <small>
              {walletRefreshing
                ? "Updating live account"
                : "Actual account value"}
            </small>
          </div>
        </div>

        <div className="tmz-status-item">
          <small>TOTAL ACCOUNT</small>
          <strong>
            {walletLoading
              ? "..."
              : walletTotal === null
                ? "—"
                : `${formatUsdt(walletTotal)} USDT`}
          </strong>
        </div>

        <div className="tmz-status-item">
          <small>SPOT</small>
          <strong>
            {walletLoading
              ? "..."
              : walletSpot === null
                ? "—"
                : `${formatUsdt(walletSpot)} USDT`}
          </strong>
        </div>

        <div className="tmz-status-item">
          <small>USDT-M</small>
          <strong>
            {walletLoading
              ? "..."
              : walletFutures === null
                ? "—"
                : `${formatUsdt(walletFutures)} USDT`}
          </strong>
        </div>
      </div>

      {walletError ? (
        <div className="tmz-soft-error" style={{ marginBottom: "18px" }}>
          Pionex balance unavailable: {walletError}
        </div>
      ) : null}

      {/* =====================================================
          MAIN COMMAND CENTER
          ===================================================== */}

      <div className="tmz-command-grid">

        {/* {data?.finalDecision === "TRADE"
                  ? "APPROVED SETUP"
                  : "TOP ENGINE CANDIDATE"} */}

        <section className="tmz-command-panel tmz-featured">

          <div className="tmz-panel-header">
            <div>
              <span className="tmz-section-label">
                BEST SETUP
              </span>

              <h2>
                {bestCandidate
                  ? bestCandidate.baseSymbol
                  : "WAITING"}
              </h2>
            </div>

            {bestCandidate && (
              <span
                className={
                  directionClass(
                    bestCandidate.change24h
                  ) ===
                  "tmz-positive"
                    ? "tmz-badge green"
                    : "tmz-badge red"
                }
              >
                {formatPct(
                  bestCandidate.change24h
                )}
              </span>
            )}
          </div>

          {bestCandidate ? (
            <div className="tmz-feature-content">

              <div className="tmz-feature-identity">

                <CoinLogo
                  symbol={
                    bestCandidate.baseSymbol
                  }
                  size={58}
                />

                <div>
                  <strong>
                    {bestCandidate.name ||
                      bestCandidate.baseSymbol}
                  </strong>

                  <small>
                    {bestCandidate.symbol}
                  </small>
                </div>

              </div>

              <div className="tmz-big-price">
                {formatPrice(
                  bestCandidate.price
                )}

                <small> USDT</small>
              </div>

              <div className="tmz-feature-chart">
                <MarketSparkline
                  values={
                    bestCandidate.sparkline
                  }
                  positive={
                    number(
                      bestCandidate.change24h,
                      0
                    ) >= 0
                  }
                  height={100}
                />
              </div>

              <div className="tmz-feature-metrics">

                <div>
                  <small>ENGINE SCORE</small>
                  <strong>
                    {bestCandidate.score ??
                      "—"}
                  </strong>
                </div>

                <div>
                  <small>CONFIDENCE</small>
                  <strong>
                    {bestCandidate.confidence !==
                    null &&
                    bestCandidate.confidence !==
                    undefined
                      ? `${bestCandidate.confidence}%`
                      : "—"}
                  </strong>
                </div>

                <div>
                  <small>RISK / REWARD</small>
                  <strong>
                    {bestCandidate.riskReward ??
                      "—"}
                  </strong>
                </div>

              </div>

              {onSelectTrade ? (
                <button
                  type="button"
                  className="tmz-refresh"
                  style={{
                    width: "100%",
                    marginTop: "14px",
                    justifyContent: "center",
                  }}
                  onClick={selectBestTrade}
                  disabled={tradeAnalysisRefreshing}
                >
                  {tradeAnalysisRefreshing
                    ? "Analyzing fresh BUY/SELL…"
                    : data?.finalDecision === "TRADE"
                      ? `SELECT ${String(liveAi?.data?.recommended?.direction || "").toUpperCase() === "SELL" ? "SELL" : "BUY"}`
                      : "ANALYZE FRESH BUY/SELL"}
                </button>
              ) : null}

            </div>
          ) : (
            <div className="tmz-empty-state">
              {loading
                ? "Loading market intelligence…"
                : "No live market candidate available."}
            </div>
          )}

        </section>

        {/* AI DECISION */}

        <section className="tmz-command-panel tmz-ai-panel">

          <div className="tmz-panel-header">
            <div>
              <span className="tmz-section-label">
                AI DECISION
              </span>

              <h2>
                {data?.finalDecision ||
                  "NO_TRADE"}
              </h2>
            </div>

            <div className="tmz-ai-orb">
              AI
            </div>
          </div>

          <div className="tmz-decision-box">

            <div className="tmz-decision-icon">
              {(liveAiFinalDecision || data?.finalDecision) ===
              "NO_TRADE"
                ? "!"
                : "✓"}
            </div>

            <div>
              <strong>
                {(liveAiFinalDecision || data?.finalDecision) ===
                "NO_TRADE"
                  ? "NO TRADE"
                  : "TRADE SIGNAL"}
              </strong>

              <p>
                {data?.mode === "FALLBACK"
                  ? "Pionex is temporarily rate limited. Fallback market data is shown for visual monitoring only."
                  : liveAiDecision?.reason ||
                    liveAiDecision?.reasoning ||
                    data?.aiDecision?.reason ||
                    data?.aiDecision?.reasoning ||
                    "TradeMindMZ risk criteria remain enforced."}
              </p>
            </div>

          </div>


          {data?.finalDecision === "TRADE" && data?.tradeExplanation ? (
            <div
              className="tmz-decision-box"
              style={{
                marginTop: "10px",
                alignItems: "flex-start",
              }}
            >
              <div className="tmz-decision-icon">✓</div>
              <div style={{width:"100%"}}>
                <strong>WHY {data.tradeExplanation.side || "TRADE"}</strong>
                <p style={{marginTop:"6px"}}>
                  {data.tradeExplanation.decisionSummary}
                </p>

                <div style={{
                  display:"grid",
                  gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",
                  gap:"12px",
                  marginTop:"12px"
                }}>
                  <div>
                    <small style={{display:"block",opacity:.45,marginBottom:"6px"}}>
                      SUPPORTING FACTORS
                    </small>
                    {(data.tradeExplanation.supportingFactors || []).map((item,index)=>(
                      <div key={index} style={{fontSize:"12px",lineHeight:"1.5",marginBottom:"5px"}}>
                        <span style={{color:"#bfff00",marginRight:"6px"}}>✓</span>{item}
                      </div>
                    ))}
                  </div>

                  <div>
                    <small style={{display:"block",opacity:.45,marginBottom:"6px"}}>
                      WHAT WOULD INVALIDATE IT
                    </small>
                    {(data.tradeExplanation.invalidationFactors || []).map((item,index)=>(
                      <div key={index} style={{fontSize:"12px",lineHeight:"1.5",marginBottom:"5px"}}>
                        <span style={{color:"#ff7777",marginRight:"6px"}}>•</span>{item}
                      </div>
                    ))}
                  </div>
                </div>

                <small style={{display:"block",marginTop:"8px",opacity:.45}}>
                  {data.tradeExplanation.tradeQualitySummary || ""}
                </small>
              </div>
            </div>
          ) : null}

          <div className="tmz-ai-stats">
            <div>
              <small>AI CONFIDENCE</small>
              <strong>
                {Number.isFinite(Number(liveAiDecision?.confidence ?? data?.aiDecision?.confidence))
                  ? `${Number(liveAiDecision?.confidence ?? data.aiDecision.confidence)}%`
                  : "—"}
              </strong>
            </div>
            <div>
              <small>AI PROVIDER</small>
              <strong>
                {liveAiDecision?.provider || data?.aiDecision?.provider || "—"}
              </strong>
            </div>
            <div>
              <small>EXECUTION</small>
              <strong>READ ONLY</strong>
            </div>
          </div>

          <div className="tmz-safety-row">
            <span>READ ONLY</span>
            <span>NO AUTO ORDERS</span>
          </div>

        </section>

      </div>

      {data?.finalDecision === "NO_TRADE" && data?.whyNoTrade ? (
        <section className="panel" style={{marginBottom:"18px"}}>
          <div className="settinghead">
            <div>
              <h3>WHY NO TRADE</h3>
              <p>{data.whyNoTrade.summary}</p>
            </div>
            <span className="status"><i/>NO TRADE</span>
          </div>
          {Array.isArray(data.whyNoTrade.failedChecks) && data.whyNoTrade.failedChecks.length ? (
            <div className="costgrid" style={{marginTop:"12px"}}>
              {data.whyNoTrade.failedChecks.map(check => (
                <span key={check.key}>
                  <b style={{color:"#ff6b6b"}}>FAIL</b>
                  <small>{check.label}: {String(check.actual ?? "—")} / {String(check.target ?? "—")}</small>
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {marketType === "SPOT" ? (
        <section className="tmz-section" style={{marginBottom:"22px"}}>
          <div className="tmz-section-heading">
            <div>
              <span className="tmz-section-label">PIONEX SPOT ACCOUNT</span>
              <h2>HOLDINGS</h2>
            </div>
            <small>Read-only balances • server-side AI exit monitoring</small>
          </div>

          {spotHoldingsError ? (
            <div className="tmz-soft-error">{spotHoldingsError}</div>
          ) : spotHoldings.length ? (
            <div className="tmz-market-grid">
              {spotHoldings.slice(0, 5).map((holding) => (
                <article className="tmz-market-card" key={holding.id || holding.symbol}>
                  <div className="tmz-card-top">
                    <div className="tmz-coin-identity">
                      <CoinLogo symbol={holding.coin} size={42} />
                      <div>
                        <strong>{holding.coin}</strong>
                        <small>SPOT HOLDING</small>
                      </div>
                    </div>
                    <span className={holding.monitor?.recommendation === "EXIT_CONSIDERATION" ? "tmz-move negative" : "tmz-move positive"}>
                      {holding.monitor?.recommendation || "HELD"}
                    </span>
                  </div>
                  <div className="tmz-card-price">
                    {formatPrice(holding.currentPrice)}
                    <small>USDT</small>
                  </div>
                  <div className="tmz-card-footer">
                    <div><small>QTY</small><strong>{formatPrice(holding.quantity)}</strong></div>
                    <div><small>VALUE</small><strong>{formatUsdt(holding.currentValueUsdt)}</strong></div>
                    <div><small>ENTRY</small><strong>{holding.entryPrice ? formatPrice(holding.entryPrice) : "—"}</strong></div>
                    <div><small>AI CONF</small><strong>{holding.monitor?.confidence != null ? holding.monitor.confidence + "%" : "—"}</strong></div>
                    <div><small>P/L</small><strong>{holding.unrealizedPercent != null ? formatPct(holding.unrealizedPercent) : "—"}</strong></div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="tmz-market-empty">
              <strong>NO NON-USDT SPOT HOLDINGS</strong>
              <span>Spot BUY signals remain read-only. Manual execution stays in Pionex.</span>
            </div>
          )}
        </section>
      ) : null}

      <ServerPerformancePanel />

      {/* =====================================================
          TOP 5
          ===================================================== */}

      <div className="tmz-section-heading">
        <div>
          <span className="tmz-section-label">
            MARKET WATCHLIST
          </span>
          <h2>TOP 5</h2>
        </div>

        <small>
          Ranked market candidates
        </small>
      </div>

      <div className="tmz-market-grid">

        {candidates.map(
          (candidate, index) => {

            const positive =
              number(
                candidate.change24h,
                0
              ) >= 0;

            return (
              <article
                className="tmz-market-card"
                key={
                  candidate.symbol ||
                  index
                }
              >

                <div className="tmz-card-top">

                  <div className="tmz-coin-identity">

                    <CoinLogo
                      symbol={
                        candidate.baseSymbol
                      }
                      size={42}
                    />

                    <div>
                      <strong>
                        {candidate.baseSymbol}
                      </strong>

                      <small>
                        #{index + 1}
                      </small>
                    </div>

                  </div>

                  <span
                    className={
                      positive
                        ? "tmz-move positive"
                        : "tmz-move negative"
                    }
                  >
                    {formatPct(
                      candidate.change24h
                    )}
                  </span>

                </div>

                <div className="tmz-card-price">
                  {formatPrice(
                    candidate.price
                  )}
                  <small>
                    USDT
                  </small>
                </div>

                <div className="tmz-card-chart">
                  <MarketSparkline
                    values={
                      candidate.sparkline
                    }
                    positive={
                      positive
                    }
                    height={70}
                  />
                </div>

                <div className="tmz-card-footer">

                  <div>
                    <small>SCORE</small>
                    <strong>
                      {candidate.score ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <small>
                      CONFIDENCE
                    </small>
                    <strong>
                      {candidate.confidence !==
                      null &&
                      candidate.confidence !==
                      undefined
                        ? `${candidate.confidence}%`
                        : "—"}
                    </strong>
                  </div>

                  {marketType === "PERP" ? (
                    <div>
                      <small>FUNDING</small>
                      <strong>
                        {candidate.fundingRate != null
                          ? Number(candidate.fundingRate).toFixed(5)
                          : "—"}
                      </strong>
                    </div>
                  ) : null}

                  <div>
                    <small>SOURCE</small>
                    <strong>
                      {data?.mode ===
                      "PIONEX"
                        ? "PIONEX"
                        : "FALLBACK"}
                    </strong>
                  </div>

                </div>

              </article>
            );
          }
        )}

        {!loading &&
        candidates.length === 0 ? (
          <div className="tmz-market-empty">
            <strong>
              MARKET FEED TEMPORARILY UNAVAILABLE
            </strong>

            <span>
              Pionex rate limiting is being
              respected. Refresh shortly.
            </span>
          </div>
        ) : null}

      </div>

      {/* =====================================================
          FOOTER STATUS
          ===================================================== */}

      <div className="tmz-dashboard-footer">

        <span>
          TradeMindMZ Engine
        </span>

        <span>
          •
        </span>

        <span>
          Market source:{" "}
          {data?.source ||
            "Connecting"}
        </span>

        <span>
          •
        </span>

        <span>
          {data?.updatedAt
            ? new Date(
                data.updatedAt
              ).toLocaleTimeString(
                "nb-NO",
                {
                  hour:
                    "2-digit",
                  minute:
                    "2-digit",
                }
              )
            : "—"}
        </span>

      </div>

      {error ? (
        <div className="tmz-soft-error">
          {data?.mode === "FALLBACK"
            ? "Pionex live feed is temporarily limited. Dashboard is showing clearly-labelled fallback data."
            : error}
        </div>
      ) : null}

    </div>
  );
}
