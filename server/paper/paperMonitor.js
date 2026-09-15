import {
  getPaperTrades,
} from "./paperTrading.js";

import {
  evaluatePaperTradesLive,
} from "./paperEvaluator.js";

import {
  syncPaperLearning,
} from "./paperLearning.js";

const DEFAULT_INTERVAL_MS =
  30_000;

let timer = null;

let state = {
  enabled: false,
  running: false,
  intervalMs:
    DEFAULT_INTERVAL_MS,
  lastRunAt: null,
  lastSuccess: null,
  lastSuccessAt: null,
  lastError: null,
  lastClosedNow: 0,
  lastLearningAdded: 0,
  runCount: 0,
  failureCount: 0,
  consecutiveFailures: 0,
  lastDurationMs: 0,
  lastRecoveryAt: null,
};

let subscribers = 0;

async function runOnce() {
  if (state.running) {
    return;
  }

  const startedAt = Date.now();

  state.running = true;
  state.runCount += 1;

  try {
    const result =
      await evaluatePaperTradesLive();

    const learningSync =
      syncPaperLearning();

    state.lastRunAt =
      new Date().toISOString();

    state.lastSuccess =
      true;

    state.lastSuccessAt =
      new Date().toISOString();

    state.lastError =
      null;

    state.lastClosedNow =
      Number(
        result?.closedNow || 0
      );

    state.lastLearningAdded =
      Number(
        learningSync?.added || 0
      );

    state.consecutiveFailures = 0;
    state.lastDurationMs =
      Date.now() - startedAt;
  } catch (error) {
    state.lastRunAt =
      new Date().toISOString();

    state.lastSuccess =
      false;

    state.failureCount += 1;
    state.consecutiveFailures += 1;

    state.lastError =
      error instanceof Error
        ? error.message
        : String(error);

    state.lastDurationMs =
      Date.now() - startedAt;
  } finally {
    state.running = false;
  }
}

export function startPaperMonitor(
  intervalMs =
    DEFAULT_INTERVAL_MS
) {
  if (timer) {
    return getPaperMonitorStatus();
  }

  const safeInterval =
    Math.max(
      15_000,
      Number(intervalMs) ||
        DEFAULT_INTERVAL_MS
    );

  state.intervalMs =
    safeInterval;

  state.enabled =
    true;

  state.lastError =
    null;

  timer = setInterval(
    runOnce,
    safeInterval
  );

  // Run one evaluation immediately.
  runOnce().catch(() => {});

  return getPaperMonitorStatus();
}

export function stopPaperMonitor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  state.enabled =
    false;

  return getPaperMonitorStatus();
}

export function getPaperMonitorStatus() {
  const now = Date.now();

  const lastRunMs =
    state.lastRunAt
      ? now - new Date(state.lastRunAt).getTime()
      : null;

  const lastSuccessMs =
    state.lastSuccessAt
      ? now - new Date(state.lastSuccessAt).getTime()
      : null;

  const staleThresholdMs =
    Math.max(
      state.intervalMs * 3,
      120_000
    );

  const stale =
    lastRunMs !== null &&
    lastRunMs > staleThresholdMs;

  const healthy =
    state.enabled &&
    !state.running &&
    !stale &&
    state.consecutiveFailures === 0;

  return {
    ...state,
    openPaperTrades:
      getPaperTrades().filter(
        (trade) =>
          trade.status === "OPEN"
      ).length,
    subscribers,
    observability: {
      healthy,
      stale,
      lastRunAgeMs:
        lastRunMs,
      lastSuccessAgeMs:
        lastSuccessMs,
      staleThresholdMs,
    },
  };
}

export function forcePaperMonitorRun() {
  return runOnce().then(
    () => getPaperMonitorStatus()
  );
}

export function resetPaperMonitorRecovery() {
  state.lastError = null;
  state.consecutiveFailures = 0;
  state.lastRecoveryAt =
    new Date().toISOString();

  return {
    success: true,
    state: getPaperMonitorStatus(),
  };
}
