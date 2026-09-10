import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Clock3,
  RefreshCw,
  Target,
  Trophy,
} from "lucide-react";

function formatPercent(value, digits = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  const sign = number > 0 ? "+" : "";

  return `${sign}${number.toFixed(digits)}%`;
}

function formatNumber(value, digits = 4) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return number.toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

function resultClass(result) {
  if (result === "WIN") {
    return "text-emerald-400";
  }

  if (result === "LOSS") {
    return "text-red-400";
  }

  if (result === "FLAT") {
    return "text-white/60";
  }

  return "text-white/40";
}

function PnlValue({ value }) {
  const number = Number(value);

  return (
    <span
      className={
        number > 0
          ? "text-emerald-400"
          : number < 0
            ? "text-red-400"
            : "text-white/60"
      }
    >
      {formatPercent(number)}
    </span>
  );
}

function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.15em] text-white/35">
          {label}
        </span>

        <Icon className="h-4 w-4 text-white/30" />
      </div>

      <div className="mt-2 text-xl font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

export default function PaperPerformancePanel() {
  const [performance, setPerformance] = useState(null);
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadData(showRefreshing = false) {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const [performanceResponse, liveResponse] =
        await Promise.all([
          fetch("/api/paper/performance?limit=10", {
            cache: "no-store",
          }),
          fetch("/api/paper/live", {
            cache: "no-store",
          }),
        ]);

      if (!performanceResponse.ok) {
        throw new Error(
          `Performance API HTTP ${performanceResponse.status}`
        );
      }

      if (!liveResponse.ok) {
        throw new Error(
          `Live paper API HTTP ${liveResponse.status}`
        );
      }

      const [performanceData, liveData] =
        await Promise.all([
          performanceResponse.json(),
          liveResponse.json(),
        ]);

      if (!performanceData?.success) {
        throw new Error(
          performanceData?.error ||
            "Performance API returned an error"
        );
      }

      if (!liveData?.success) {
        throw new Error(
          liveData?.error ||
            "Live paper API returned an error"
        );
      }

      setPerformance(performanceData);
      setLive(liveData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : String(err)
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData(false);

    const interval = window.setInterval(() => {
      loadData(false);
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const overall = performance?.overall || {
    total: 0,
    open: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalPnlPercent: 0,
    profitFactor: 0,
    avgWinPercent: 0,
    avgLossPercent: 0,
  };

  const openTrades = useMemo(
    () =>
      Array.isArray(live?.trades)
        ? live.trades.filter(
            (trade) => trade?.status === "OPEN"
          )
        : [],
    [live]
  );

  const recentHistory = Array.isArray(
    performance?.history
  )
    ? performance.history
    : [];

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              Paper Performance
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-white">
                Paper Trading Performance
              </h2>

              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                LIVE
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                refreshing ? "animate-spin" : ""
              }`}
            />
            Refresh
          </button>
        </div>

        {loading && !performance ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-sm text-white/45">
            Laster paper performance...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
            <div className="text-sm font-semibold text-white">
              Kunne ikke laste paper performance.
            </div>

            <div className="mt-1 text-sm text-red-300/70">
              {error}
            </div>

            <button
              type="button"
              onClick={() => loadData(true)}
              className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              Prøv igjen
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total P&L"
                value={
                  <PnlValue
                    value={overall.totalPnlPercent}
                  />
                }
                icon={BarChart3}
              />

              <StatCard
                label="Win Rate"
                value={`${formatNumber(overall.winRate, 1)}%`}
                icon={Target}
              />

              <StatCard
                label="Profit Factor"
                value={
                  overall.profitFactor === null
                    ? "∞"
                    : formatNumber(
                        overall.profitFactor,
                        2
                      )
                }
                icon={Trophy}
              />

              <StatCard
                label="Trades"
                value={`${overall.closed} / ${overall.total}`}
                icon={Activity}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
              <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/35">
                  Performance Summary
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-white/30">
                      Open
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {overall.open}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-white/30">
                      Closed
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {overall.closed}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-white/30">
                      Wins
                    </div>
                    <div className="mt-1 text-lg font-semibold text-emerald-400">
                      {overall.wins}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-white/30">
                      Losses
                    </div>
                    <div className="mt-1 text-lg font-semibold text-red-400">
                      {overall.losses}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-white/30">
                      Avg Win
                    </div>
                    <div className="mt-1 text-lg font-semibold">
                      <PnlValue
                        value={overall.avgWinPercent}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-white/30">
                      Avg Loss
                    </div>
                    <div className="mt-1 text-lg font-semibold">
                      <PnlValue
                        value={overall.avgLossPercent}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/35">
                      Open Paper Trades
                    </div>

                    <div className="mt-1 text-xs text-white/30">
                      Live Pionex market price
                    </div>
                  </div>

                  <Clock3 className="h-4 w-4 text-white/30" />
                </div>

                {openTrades.length === 0 ? (
                  <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/40">
                    Ingen åpne paper trades.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {openTrades.map((trade) => {
                      const pnl =
                        Number(
                          trade.unrealizedPnlPercent
                        );

                      return (
                        <div
                          key={trade.id}
                          className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-base font-bold text-white">
                                {trade.symbol}
                              </div>

                              <div className="mt-1 flex items-center gap-2 text-xs text-white/40">
                                {trade.direction ===
                                "SELL" ? (
                                  <ArrowDown className="h-3.5 w-3.5 text-red-400" />
                                ) : (
                                  <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
                                )}

                                {trade.direction}

                                <span>•</span>

                                Entry{" "}
                                {formatNumber(
                                  trade.entry
                                )}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-xs uppercase tracking-wider text-white/30">
                                Live P&L
                              </div>

                              <div className="mt-1 text-xl font-bold">
                                <PnlValue
                                  value={pnl}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <div className="text-white/30">
                                Current
                              </div>
                              <div className="mt-1 font-semibold text-white">
                                {formatNumber(
                                  trade.currentPrice
                                )}
                              </div>
                            </div>

                            <div>
                              <div className="text-white/30">
                                Stop
                              </div>
                              <div className="mt-1 font-semibold text-white">
                                {formatNumber(
                                  trade.stopLoss
                                )}
                              </div>
                            </div>

                            <div>
                              <div className="text-white/30">
                                Target
                              </div>
                              <div className="mt-1 font-semibold text-white">
                                {formatNumber(
                                  trade.takeProfit
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/35">
                Recent Closed Trades
              </div>

              {recentHistory.length === 0 ? (
                <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/40">
                  Ingen lukkede paper trades ennå. Statistikken fylles automatisk når trades avsluttes.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-white/30">
                        <th className="px-2 py-2 font-medium">
                          Symbol
                        </th>
                        <th className="px-2 py-2 font-medium">
                          Direction
                        </th>
                        <th className="px-2 py-2 font-medium">
                          Result
                        </th>
                        <th className="px-2 py-2 font-medium">
                          P&L
                        </th>
                        <th className="px-2 py-2 font-medium">
                          AI
                        </th>
                        <th className="px-2 py-2 font-medium">
                          Reason
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {recentHistory.map((trade) => (
                        <tr
                          key={trade.id}
                          className="border-b border-white/5 last:border-0"
                        >
                          <td className="px-2 py-3 font-semibold text-white">
                            {trade.symbol}
                          </td>

                          <td className="px-2 py-3 text-white/55">
                            {trade.direction}
                          </td>

                          <td
                            className={`px-2 py-3 font-semibold ${resultClass(
                              trade.result
                            )}`}
                          >
                            {trade.result}
                          </td>

                          <td className="px-2 py-3 font-semibold">
                            <PnlValue
                              value={trade.pnlPercent}
                            />
                          </td>

                          <td className="px-2 py-3 text-white/55">
                            {trade.aiProvider || "—"}
                          </td>

                          <td className="px-2 py-3 text-white/35">
                            {trade.evaluationReason || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {performance?.bestTrade ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/35">
                    Best Trade
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-white">
                        {performance.bestTrade.symbol}
                      </div>

                      <div className="mt-1 text-xs text-white/40">
                        {performance.bestTrade.direction}
                      </div>
                    </div>

                    <div className="text-right text-xl font-bold">
                      <PnlValue
                        value={
                          performance.bestTrade
                            .pnlPercent
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/35">
                    Worst Trade
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-white">
                        {performance.worstTrade?.symbol || "—"}
                      </div>

                      <div className="mt-1 text-xs text-white/40">
                        {performance.worstTrade?.direction || "—"}
                      </div>
                    </div>

                    <div className="text-right text-xl font-bold">
                      <PnlValue
                        value={
                          performance.worstTrade
                            ?.pnlPercent
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
