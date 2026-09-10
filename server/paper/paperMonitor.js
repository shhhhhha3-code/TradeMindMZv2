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
  lastError: null,
  lastClosedNow: 0,
};

let subscribers = 0;

async function runOnce() {
  if (state.running) {
    return;
  }

  state.running = true;

  try {
    const result =
      await evaluatePaperTradesLive();

    const learningSync =
      syncPaperLearning();

    state.lastRunAt =
      new Date().toISOString();

    state.lastSuccess =
      true;

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
  } catch (error) {
    state.lastRunAt =
      new Date().toISOString();

    state.lastSuccess =
      false;

    state.lastError =
      error instanceof Error
        ? error.message
        : String(error);
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
  return {
    ...state,
    openPaperTrades:
      getPaperTrades().filter(
        (trade) =>
          trade.status === "OPEN"
      ).length,
    subscribers,
  };
}

export function forcePaperMonitorRun() {
  return runOnce().then(
    () => getPaperMonitorStatus()
  );
}
