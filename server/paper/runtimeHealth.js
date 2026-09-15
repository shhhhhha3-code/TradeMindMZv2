import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../../data");
const FILE_PATH = path.join(
  DATA_DIR,
  "paper-monitor-health.json",
);

const MAX_HISTORY = 250;

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, {
    recursive: true,
  });

  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(
      FILE_PATH,
      JSON.stringify(
        {
          version: 1,
          events: [],
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

function loadStore() {
  ensureStorage();

  try {
    const raw =
      fs.readFileSync(
        FILE_PATH,
        "utf8",
      );

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      !Array.isArray(parsed.events)
    ) {
      return {
        version: 1,
        events: [],
      };
    }

    return {
      version:
        Number(parsed.version) || 1,
      events:
        parsed.events.slice(
          -MAX_HISTORY,
        ),
    };
  } catch {
    return {
      version: 1,
      events: [],
    };
  }
}

function saveStore(store) {
  ensureStorage();

  const safe = {
    version: 1,
    events:
      Array.isArray(store.events)
        ? store.events.slice(
            -MAX_HISTORY,
          )
        : [],
  };

  fs.writeFileSync(
    FILE_PATH,
    JSON.stringify(
      safe,
      null,
      2,
    ),
    "utf8",
  );
}

export function recordPaperMonitorHealth(
  event,
) {
  const store = loadStore();

  const entry = {
    timestamp:
      new Date().toISOString(),
    type:
      String(
        event?.type ||
          "STATUS",
      ),
    healthy:
      event?.healthy ?? null,
    stale:
      event?.stale ?? null,
    running:
      event?.running ?? null,
    enabled:
      event?.enabled ?? null,
    lastError:
      event?.lastError ?? null,
    consecutiveFailures:
      Number(
        event?.consecutiveFailures || 0,
      ),
    runCount:
      Number(
        event?.runCount || 0,
      ),
    failureCount:
      Number(
        event?.failureCount || 0,
      ),
    lastDurationMs:
      Number(
        event?.lastDurationMs || 0,
      ),
    lastRunAt:
      event?.lastRunAt ?? null,
    lastSuccessAt:
      event?.lastSuccessAt ?? null,
  };

  store.events.push(entry);
  store.events =
    store.events.slice(
      -MAX_HISTORY,
    );

  saveStore(store);

  return entry;
}

export function getPaperMonitorHealthHistory(
  limit = 50,
) {
  const store = loadStore();

  const safeLimit = Math.min(
    MAX_HISTORY,
    Math.max(
      1,
      Number(limit) || 50,
    ),
  );

  return store.events
    .slice(-safeLimit)
    .reverse();
}

export function getPaperMonitorHealthSummary() {
  const store = loadStore();
  const events = store.events;

  const latest =
    events.length
      ? events[events.length - 1]
      : null;

  const failures =
    events.filter(
      (event) =>
        Number(
          event.consecutiveFailures || 0,
        ) > 0 ||
        event.healthy === false,
    );

  const recoveries =
    events.filter(
      (event) =>
        event.type === "RECOVERY",
    );

  return {
    success: true,
    storage: {
      file:
        "data/paper-monitor-health.json",
      maxHistory:
        MAX_HISTORY,
      eventCount:
        events.length,
    },
    latest,
    totalFailures:
      failures.length,
    totalRecoveries:
      recoveries.length,
  };
}

export function clearPaperMonitorHealthHistory() {
  saveStore({
    version: 1,
    events: [],
  });

  return {
    success: true,
    cleared: true,
  };
}
