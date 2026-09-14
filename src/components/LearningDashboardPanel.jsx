import React, { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

function number(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function percent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${number(n)}%`;
}

function statusText(sampleSize, reliability) {
  if (!sampleSize) return "NO DATA";
  return reliability || "INSUFFICIENT";
}

function statusDescription(sampleSize, reliability) {
  if (!sampleSize) {
    return "Ingen avsluttede paper trades registrert ennå.";
  }

  if (reliability === "STRONG") {
    return "Datagrunnlaget er stort nok til sterk historisk vurdering.";
  }

  if (reliability === "MEDIUM") {
    return "Datagrunnlaget begynner å bli brukbart, men trenger mer historikk.";
  }

  if (reliability === "EARLY") {
    return "Tidlige mønstre registreres, men bør fortsatt behandles forsiktig.";
  }

  return "For lite data til å trekke pålitelige konklusjoner.";
}

function Metric({ label, value, detail }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">
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

function PatternRow({ item, positive = false }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white">
            {item?.name || "UNKNOWN"}
          </div>

          <div className="mt-1 text-xs text-white/35">
            {item?.total ?? 0} trades · {percent(item?.winRate)}
          </div>
        </div>

        <div className="text-right">
          <div className="text-sm font-semibold text-white">
            {number(item?.avgPnlPercent)}%
          </div>

          <div className="text-[10px] uppercase tracking-wider text-white/30">
            avg P&L
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/30">
        <span>
          Reliability: {item?.reliability || "—"}
        </span>

        <span>
          {positive ? "STRONG" : "WARNING"}
        </span>
      </div>
    </div>
  );
}

export default function LearningDashboardPanel() {
  const [v5, setV5] = useState(null);
  const [v6, setV6] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadLearning = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const [v5Response, v6Response, patternResponse] =
        await Promise.all([
          fetch("/api/paper/learning/adaptive-v5"),
          fetch("/api/paper/learning/confidence-v6"),
          fetch("/api/paper/learning/patterns"),
        ]);

      const [v5Data, v6Data, patternData] =
        await Promise.all([
          v5Response.json(),
          v6Response.json(),
          patternResponse.json(),
        ]);

      if (!v5Response.ok || !v5Data?.success) {
        throw new Error(
          v5Data?.error ||
            `Adaptive Learning V5 failed (${v5Response.status})`,
        );
      }

      if (!v6Response.ok || !v6Data?.success) {
        throw new Error(
          v6Data?.error ||
            `Confidence Calibration V6 failed (${v6Response.status})`,
        );
      }

      if (!patternResponse.ok || !patternData?.success) {
        throw new Error(
          patternData?.error ||
            `Pattern intelligence failed (${patternResponse.status})`,
        );
      }

      setV5(v5Data);
      setV6(v6Data);
      setPatterns(patternData);
    } catch (err) {
      setError(
        err?.message ||
          "Unable to load learning intelligence.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLearning();

    const interval = window.setInterval(() => {
      loadLearning({ silent: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  const strongestSignals = useMemo(
    () =>
      Array.isArray(v5?.strongestSignals)
        ? v5.strongestSignals.slice(0, 3)
        : [],
    [v5],
  );

  const warningSignals = useMemo(
    () =>
      Array.isArray(v5?.warningSignals)
        ? v5.warningSignals.slice(0, 3)
        : [],
    [v5],
  );

  const strongestPatterns = useMemo(
    () =>
      Array.isArray(patterns?.strongestPatterns)
        ? patterns.strongestPatterns.slice(0, 3)
        : [],
    [patterns],
  );

  const calibration =
    v6?.confidenceCalibration || {};

  const overall = v5?.overall || {};

  const sampleSize =
    v5?.sampleSize ??
    v6?.sampleSize ??
    patterns?.sampleSize ??
    0;

  const reliability =
    v5?.reliability ||
    v6?.reliability ||
    patterns?.reliability ||
    "INSUFFICIENT";

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              <BrainCircuit className="h-4 w-4" />
              AI Learning Intelligence
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-white">
                Learning feedback & calibration
              </h2>

              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/55">
                Observe Only
              </span>
            </div>

            <p className="mt-1 max-w-3xl text-sm text-white/40">
              TradeMindMZ lærer fra avsluttede paper trades uten å
              endre ekte signaler eller plassere Pionex-ordrer.
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadLearning({ silent: true })}
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
              : "Refresh learning"}
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm text-white/45">
              Laster læringsdata...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-medium text-white">
              Learning intelligence kunne ikke lastes.
            </div>

            <div className="mt-1 text-sm text-white/40">
              {error}
            </div>

            <button
              type="button"
              onClick={() => loadLearning()}
              className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Learning Samples"
                value={sampleSize}
                detail={statusText(sampleSize, reliability)}
              />

              <Metric
                label="Win Rate"
                value={percent(overall.winRate)}
                detail={`${overall.wins ?? 0} wins · ${overall.losses ?? 0} losses`}
              />

              <Metric
                label="Total P&L"
                value={`${number(overall.totalPnlPercent)}%`}
                detail={`Avg ${number(overall.avgPnlPercent)}%`}
              />

              <Metric
                label="Reliability"
                value={reliability}
                detail={statusDescription(
                  sampleSize,
                  reliability,
                )}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                      Confidence Calibration
                    </div>

                    <div className="mt-1 text-lg font-semibold text-white">
                      {calibration.interpretation ||
                        "INSUFFICIENT_DATA"}
                    </div>
                  </div>

                  <Target className="h-5 w-5 text-white/35" />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <Metric
                    label="Expected"
                    value={percent(
                      calibration.expectedConfidence,
                    )}
                  />

                  <Metric
                    label="Actual"
                    value={percent(
                      calibration.actualWinRate,
                    )}
                  />

                  <Metric
                    label="Gap"
                    value={percent(
                      calibration.gap,
                    )}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                      Learning Safety
                    </div>

                    <div className="mt-1 text-lg font-semibold text-white">
                      Observe-only protection
                    </div>
                  </div>

                  <ShieldCheck className="h-5 w-5 text-white/35" />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Metric
                    label="Signal Override"
                    value="OFF"
                  />

                  <Metric
                    label="Auto Trading"
                    value="OFF"
                  />

                  <Metric
                    label="Minimum Samples"
                    value={
                      v6?.policy?.minimumSamples ??
                      30
                    }
                  />

                  <Metric
                    label="Feedback Samples"
                    value={
                      v5?.policy?.minimumFeedbackSamples ??
                      5
                    }
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-white/45" />
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                    Strongest Signals
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {strongestSignals.length ? (
                    strongestSignals.map((item, index) => (
                      <PatternRow
                        key={`${item.name}-${index}`}
                        item={item}
                        positive
                      />
                    ))
                  ) : (
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-white/35">
                      Ingen pålitelige sterke mønstre ennå.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-white/45" />
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                    Warning Signals
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {warningSignals.length ? (
                    warningSignals.map((item, index) => (
                      <PatternRow
                        key={`${item.name}-${index}`}
                        item={item}
                      />
                    ))
                  ) : (
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-white/35">
                      Ingen pålitelige advarselsmønstre ennå.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-white/45" />
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                    Strongest Historical Patterns
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {strongestPatterns.length ? (
                    strongestPatterns.map(
                      (item, index) => (
                        <PatternRow
                          key={`${item.name}-${index}`}
                          item={item}
                          positive
                        />
                      ),
                    )
                  ) : (
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-white/35">
                      Historical patterns trenger mer data.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="text-[10px] uppercase tracking-[0.16em] text-white/25">
              {statusDescription(
                sampleSize,
                reliability,
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
