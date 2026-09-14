import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  Clock3,
  History,
  RefreshCw,
  ShieldCheck,
  Target,
} from "lucide-react";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function number(value, digits = 4) {
  const n = num(value);
  if (n === null) return "—";

  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function percent(value) {
  const n = num(value);
  if (n === null) return "—";

  const sign = n > 0 ? "+" : "";
  return `${sign}${number(n, 2)}%`;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resultClass(result) {
  const normalized = String(result || "").toUpperCase();

  if (normalized === "WIN") {
    return "text-white";
  }

  if (normalized === "LOSS") {
    return "text-white";
  }

  return "text-white/60";
}

function resultLabel(result) {
  const normalized = String(result || "").toUpperCase();

  if (normalized === "WIN") return "WIN";
  if (normalized === "LOSS") return "LOSS";
  if (normalized === "FLAT") return "FLAT";

  return normalized || "UNKNOWN";
}

function DirectionIcon({ direction }) {
  return String(direction || "").toUpperCase() === "SELL" ? (
    <ArrowDownRight className="h-4 w-4" />
  ) : (
    <ArrowUpRight className="h-4 w-4" />
  );
}

function EventCard({ trade }) {
  const direction =
    String(trade?.direction || "UNKNOWN").toUpperCase();

  const result = resultLabel(trade?.result);

  const pnl = num(trade?.pnlPercent);

  const isLoss = result === "LOSS";

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-white">
              {trade?.symbol || "UNKNOWN"}
            </div>

            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/55">
              <DirectionIcon direction={direction} />
              {direction}
            </span>
          </div>

          <div className="mt-1 text-xs text-white/35">
            Paper trade · {formatDate(trade?.createdAt)}
          </div>
        </div>

        <div className="text-right">
          <div
            className={`text-sm font-semibold ${resultClass(
              result,
            )}`}
          >
            {result}
          </div>

          <div
            className={`text-xs ${
              pnl !== null && pnl < 0
                ? "text-white/45"
                : "text-white/45"
            }`}
          >
            {percent(pnl)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/30">
            Entry
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {number(trade?.entry)}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/30">
            Exit
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {number(trade?.exit?.price)}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/30">
            Engine Score
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {number(trade?.engineScore, 0)}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/30">
            AI Confidence
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {number(trade?.aiConfidence ?? trade?.confidence, 0)}%
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/35">
        <span>
          Risk:{" "}
          <strong className="text-white/55">
            {trade?.risk || "—"}
          </strong>
        </span>

        <span>
          R/R:{" "}
          <strong className="text-white/55">
            {number(trade?.riskReward, 2)}
          </strong>
        </span>

        <span>
          Horizon:{" "}
          <strong className="text-white/55">
            {number(trade?.horizonMinutes, 0)} min
          </strong>
        </span>

        <span>
          AI:{" "}
          <strong className="text-white/55">
            {trade?.aiProvider || "—"}
          </strong>
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          <BrainCircuit className="h-3.5 w-3.5" />
          Evaluation
        </div>

        <div className="mt-2 grid gap-2 text-xs text-white/45 sm:grid-cols-2">
          <div>
            Evaluation reason:{" "}
            <strong className="text-white/60">
              {trade?.evaluationReason || "—"}
            </strong>
          </div>

          <div>
            Closed:{" "}
            <strong className="text-white/60">
              {formatDate(trade?.evaluatedAt)}
            </strong>
          </div>
        </div>

        {isLoss ? (
          <div className="mt-3 text-xs leading-5 text-white/35">
            Resultatet er lagret som læringsdata. Det påvirker
            ikke ekte Pionex-signaler automatisk.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function JournalMetric({ label, value, detail }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
        {label}
      </div>

      <div className="mt-1 text-xl font-semibold text-white">
        {value}
      </div>

      {detail ? (
        <div className="mt-1 text-xs text-white/35">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export default function LearningJournalPanel() {
  const [trades, setTrades] = useState([]);
  const [learning, setLearning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadJournal({ silent = false } = {}) {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const [tradesResponse, learningResponse] =
        await Promise.all([
          fetch("/api/paper/trades"),
          fetch("/api/paper/learning"),
        ]);

      const [tradesData, learningData] =
        await Promise.all([
          tradesResponse.json(),
          learningResponse.json(),
        ]);

      if (!tradesResponse.ok || !tradesData?.success) {
        throw new Error(
          tradesData?.error ||
            `Paper trades failed (${tradesResponse.status})`,
        );
      }

      if (!learningResponse.ok || !learningData?.success) {
        throw new Error(
          learningData?.error ||
            `Paper learning failed (${learningResponse.status})`,
        );
      }

      const rawTrades = Array.isArray(tradesData?.trades)
        ? tradesData.trades
        : [];

      const closedTrades = rawTrades
        .filter(
          trade =>
            String(trade?.status || "").toUpperCase() ===
            "CLOSED",
        )
        .sort(
          (a, b) =>
            new Date(
              b.evaluatedAt ||
                b.createdAt ||
                0,
            ).getTime() -
            new Date(
              a.evaluatedAt ||
                a.createdAt ||
                0,
            ).getTime(),
        );

      setTrades(closedTrades);
      setLearning(learningData);
    } catch (err) {
      setError(
        err?.message ||
          "Unable to load learning journal.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadJournal();

    const interval = window.setInterval(() => {
      loadJournal({ silent: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  const latestTrade = trades[0] || null;

  const closedCount = trades.length;

  const wins = trades.filter(
    trade =>
      String(trade?.result || "").toUpperCase() ===
      "WIN",
  ).length;

  const losses = trades.filter(
    trade =>
      String(trade?.result || "").toUpperCase() ===
      "LOSS",
  ).length;

  const winRate =
    closedCount > 0
      ? (wins / closedCount) * 100
      : 0;

  const overallPnl =
    trades.reduce(
      (sum, trade) =>
        sum + (num(trade?.pnlPercent) || 0),
      0,
    );

  const sampleSize =
    learning?.overall?.total ??
    learning?.totalRecords ??
    closedCount;

  const journalReliability =
    sampleSize >= 30
      ? "STRONG"
      : sampleSize >= 15
        ? "MEDIUM"
        : sampleSize >= 5
          ? "EARLY"
          : "INSUFFICIENT";

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              <History className="h-4 w-4" />
              Learning Journal
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-white">
                Signal → Trade → Result
              </h2>

              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/55">
                Paper Only
              </span>
            </div>

            <p className="mt-1 max-w-3xl text-sm text-white/40">
              Komplett historikk over avsluttede paper trades og
              hva TradeMindMZ lærer av resultatene.
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadJournal({ silent: true })}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                refreshing ? "animate-spin" : ""
              }`}
            />

            {refreshing
              ? "Refreshing..."
              : "Refresh journal"}
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-sm text-white/40">
            Laster learning journal...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-medium text-white">
              Learning journal kunne ikke lastes.
            </div>

            <div className="mt-1 text-sm text-white/40">
              {error}
            </div>

            <button
              type="button"
              onClick={() => loadJournal()}
              className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <JournalMetric
                label="Closed Trades"
                value={closedCount}
                detail={`${wins} wins · ${losses} losses`}
              />

              <JournalMetric
                label="Win Rate"
                value={percent(winRate)}
                detail="Basert på avsluttede paper trades"
              />

              <JournalMetric
                label="Total P&L"
                value={percent(overallPnl)}
                detail="Summert fra journalen"
              />

              <JournalMetric
                label="Learning Reliability"
                value={journalReliability}
                detail={`${sampleSize} learning samples`}
              />
            </div>

            {latestTrade ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                      Latest completed trade
                    </div>

                    <div className="mt-1 text-lg font-semibold text-white">
                      {latestTrade.symbol}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-white/35">
                    <Clock3 className="h-4 w-4" />
                    {formatDate(
                      latestTrade.evaluatedAt,
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <JournalMetric
                    label="Result"
                    value={resultLabel(
                      latestTrade.result,
                    )}
                  />

                  <JournalMetric
                    label="P&L"
                    value={percent(
                      latestTrade.pnlPercent,
                    )}
                  />

                  <JournalMetric
                    label="Direction"
                    value={
                      latestTrade.direction ||
                      "—"
                    }
                  />

                  <JournalMetric
                    label="Evaluation"
                    value={
                      latestTrade.evaluationReason ||
                      "—"
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-white/35" />
                  <div className="text-sm font-medium text-white">
                    Ingen avsluttede paper trades ennå.
                  </div>
                </div>

                <div className="mt-1 text-sm text-white/35">
                  Journalen fylles automatisk når paper trades
                  blir evaluert.
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
              <ShieldCheck className="h-4 w-4" />
              Trade history
            </div>

            {trades.length ? (
              <div className="space-y-3">
                {trades.slice(0, 10).map(trade => (
                  <EventCard
                    key={
                      trade?.id ||
                      `${trade?.symbol}-${trade?.evaluatedAt}`
                    }
                    trade={trade}
                  />
                ))}
              </div>
            ) : null}

            {trades.length > 10 ? (
              <div className="text-center text-xs text-white/25">
                Viser de 10 siste avsluttede paper trades.
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
