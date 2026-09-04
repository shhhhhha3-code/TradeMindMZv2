import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH =
  path.join(
    __dirname,
    "tradeCriteriaConfig.json"
  );

const DEFAULT_CRITERIA = {
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

function cloneDefaults() {
  return JSON.parse(
    JSON.stringify(DEFAULT_CRITERIA)
  );
}

function number(
  value,
  fallback
) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function sanitizeCriteria(
  input = {}
) {
  const defaults =
    cloneDefaults();

  const minimumScore =
    Math.round(
      Math.max(
        0,
        Math.min(
          100,
          number(
            input.minimumScore,
            defaults.minimumScore
          )
        )
      )
    );

  const minimumConfidence =
    Math.round(
      Math.max(
        0,
        Math.min(
          100,
          number(
            input.minimumConfidence,
            defaults.minimumConfidence
          )
        )
      )
    );

  const minimumRiskReward =
    Math.max(
      0.1,
      Math.min(
        20,
        number(
          input.minimumRiskReward,
          defaults.minimumRiskReward
        )
      )
    );

  const minimumRsi =
    Math.max(
      0,
      Math.min(
        100,
        number(
          input.minimumRsi,
          defaults.minimumRsi
        )
      )
    );

  const maximumRsi =
    Math.max(
      0,
      Math.min(
        100,
        number(
          input.maximumRsi,
          defaults.maximumRsi
        )
      )
    );

  const minimumVolumeRatio =
    Math.max(
      0,
      Math.min(
        20,
        number(
          input.minimumVolumeRatio,
          defaults.minimumVolumeRatio
        )
      )
    );

  const highRiskInput =
    input.highRisk || {};

  const highRiskScore =
    Math.round(
      Math.max(
        0,
        Math.min(
          100,
          number(
            highRiskInput.minimumScore,
            defaults.highRisk.minimumScore
          )
        )
      )
    );

  const highRiskConfidence =
    Math.round(
      Math.max(
        0,
        Math.min(
          100,
          number(
            highRiskInput.minimumConfidence,
            defaults.highRisk.minimumConfidence
          )
        )
      )
    );

  return {
    minimumScore,
    minimumConfidence,
    minimumRiskReward:
      Number(
        minimumRiskReward.toFixed(2)
      ),
    minimumRsi:
      Number(
        minimumRsi.toFixed(2)
      ),
    maximumRsi:
      Number(
        maximumRsi.toFixed(2)
      ),
    minimumVolumeRatio:
      Number(
        minimumVolumeRatio.toFixed(2)
      ),
    highRisk: {
      minimumScore:
        highRiskScore,
      minimumConfidence:
        highRiskConfidence,
    },
  };
}

export function getTradeCriteria() {
  try {
    if (
      fs.existsSync(
        CONFIG_PATH
      )
    ) {
      const raw =
        fs.readFileSync(
          CONFIG_PATH,
          "utf8"
        );

      return sanitizeCriteria(
        JSON.parse(raw)
      );
    }
  } catch (error) {
    console.error(
      "Trade criteria config read failed:",
      error
    );
  }

  return cloneDefaults();
}

export function saveTradeCriteria(
  input = {}
) {
  const criteria =
    sanitizeCriteria(input);

  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify(
      criteria,
      null,
      2
    ),
    "utf8"
  );

  return criteria;
}

export function evaluateTradeCandidate(
  candidate = {}
) {
  const criteria =
    getTradeCriteria();

  const score =
    number(
      candidate.score,
      null
    );

  const confidence =
    number(
      candidate.confidence,
      null
    );

  const riskReward =
    number(
      candidate.riskReward,
      null
    );

  const rsi =
    number(
      candidate.rsi,
      null
    );

  const volumeRatio =
    number(
      candidate.volumeRatio,
      null
    );

  const entry =
    number(
      candidate.entry,
      null
    );

  const stopLoss =
    number(
      candidate.stopLoss,
      null
    );

  const takeProfit =
    number(
      candidate.takeProfit,
      null
    );

  const direction =
    String(
      candidate.direction || ""
    ).toUpperCase();

  const riskLevel =
    String(
      candidate.riskLevel ||
      "UNKNOWN"
    ).toUpperCase();

  const checks = [
    {
      key: "score",
      label: "Score",
      actual: score,
      target:
        criteria.minimumScore,
      operator: ">=",
      passed:
        score !== null &&
        score >=
          criteria.minimumScore,
    },

    {
      key: "confidence",
      label: "Confidence",
      actual: confidence,
      target:
        criteria.minimumConfidence,
      operator: ">=",
      passed:
        confidence !== null &&
        confidence >=
          criteria.minimumConfidence,
    },

    {
      key: "riskReward",
      label: "Risk / Reward",
      actual: riskReward,
      target:
        criteria.minimumRiskReward,
      operator: ">=",
      passed:
        riskReward !== null &&
        riskReward >=
          criteria.minimumRiskReward,
    },

    {
      key: "rsi",
      label: "RSI",
      actual: rsi,
      target:
        `${criteria.minimumRsi}–${criteria.maximumRsi}`,
      operator: "RANGE",
      passed:
        rsi !== null &&
        rsi >=
          criteria.minimumRsi &&
        rsi <=
          criteria.maximumRsi,
    },

    {
      key: "volumeRatio",
      label: "Volume ratio",
      actual: volumeRatio,
      target:
        criteria.minimumVolumeRatio,
      operator: ">=",
      passed:
        volumeRatio !== null &&
        volumeRatio >=
          criteria.minimumVolumeRatio,
    },
  ];

  let validLevels =
    false;

  if (
    entry !== null &&
    stopLoss !== null &&
    takeProfit !== null
  ) {
    if (
      direction === "BUY"
    ) {
      validLevels =
        stopLoss <
          entry &&
        entry <
          takeProfit;
    }

    if (
      direction === "SELL"
    ) {
      validLevels =
        stopLoss >
          entry &&
        entry >
          takeProfit;
    }
  }

  checks.push({
    key: "tradeLevels",
    label: "Trade levels",
    actual:
      validLevels
        ? "VALID"
        : "INVALID",
    target:
      direction === "BUY"
        ? "SL < Entry < TP"
        : direction === "SELL"
          ? "SL > Entry > TP"
          : "Valid direction",
    operator:
      "STRUCTURE",
    passed:
      validLevels &&
      ["BUY", "SELL"]
        .includes(direction),
  });

  checks.push({
    key: "highRisk",
    label:
      "HIGH risk protection",
    actual:
      riskLevel === "HIGH"
        ? `${score ?? "—"} / ${confidence ?? "—"}%`
        : "NOT REQUIRED",
    target:
      riskLevel === "HIGH"
        ? `${criteria.highRisk.minimumScore} / ${criteria.highRisk.minimumConfidence}%`
        : "Only enforced for HIGH risk",
    operator:
      riskLevel === "HIGH"
        ? ">="
        : "INFO",
    passed:
      riskLevel === "HIGH"
        ? score !== null &&
          confidence !== null &&
          score >=
            criteria.highRisk.minimumScore &&
          confidence >=
            criteria.highRisk.minimumConfidence
        : true,
  });

  const passed =
    checks.every(
      check => check.passed
    );

  const failedChecks =
    checks.filter(
      check => !check.passed
    );

  return {
    passed,
    checks,
    failedChecks,
    criteria,
  };
}
