export function calculatePaperHealthScore(
  monitor,
  historySummary = null,
) {
  const observability =
    monitor?.observability || {};

  let score = 100;
  const reasons = [];

  if (!monitor?.enabled) {
    score -= 50;
    reasons.push(
      "Paper monitor is disabled",
    );
  }

  if (monitor?.running) {
    score -= 10;
    reasons.push(
      "Paper monitor is currently running",
    );
  }

  if (observability.stale) {
    score -= 45;
    reasons.push(
      "Paper monitor is stale",
    );
  }

  const consecutiveFailures =
    Number(
      monitor?.consecutiveFailures || 0,
    );

  if (consecutiveFailures > 0) {
    score -= Math.min(
      40,
      consecutiveFailures * 10,
    );

    reasons.push(
      `${consecutiveFailures} consecutive monitor failure(s)`,
    );
  }

  const failureCount =
    Number(
      monitor?.failureCount || 0,
    );

  if (
    failureCount > 0 &&
    consecutiveFailures === 0
  ) {
    score -= Math.min(
      15,
      failureCount * 2,
    );

    reasons.push(
      `${failureCount} historical monitor failure(s)`,
    );
  }

  const totalFailures =
    Number(
      historySummary?.totalFailures || 0,
    );

  if (totalFailures > 0) {
    score -= Math.min(
      10,
      totalFailures,
    );

    if (
      !reasons.some(
        (reason) =>
          reason.includes(
            "historical monitor failure",
          ),
      )
    ) {
      reasons.push(
        `${totalFailures} recorded health failure event(s)`,
      );
    }
  }

  score = Math.max(
    0,
    Math.min(
      100,
      Math.round(score),
    ),
  );

  let level = "HEALTHY";

  if (score < 60) {
    level = "CRITICAL";
  } else if (score < 85) {
    level = "WARNING";
  }

  if (reasons.length === 0) {
    reasons.push(
      "Paper monitor is operating normally",
    );
  }

  return {
    success: true,
    score,
    level,
    healthy:
      level === "HEALTHY",
    warning:
      level === "WARNING",
    critical:
      level === "CRITICAL",
    reasons,
    metrics: {
      enabled:
        Boolean(monitor?.enabled),
      running:
        Boolean(monitor?.running),
      stale:
        Boolean(observability.stale),
      consecutiveFailures,
      failureCount,
      lastRunAgeMs:
        observability.lastRunAgeMs ??
        null,
      lastSuccessAgeMs:
        observability.lastSuccessAgeMs ??
        null,
      staleThresholdMs:
        observability.staleThresholdMs ??
        null,
      historyFailureEvents:
        totalFailures,
      historyRecoveryEvents:
        Number(
          historySummary?.totalRecoveries || 0,
        ),
    },
  };
}
