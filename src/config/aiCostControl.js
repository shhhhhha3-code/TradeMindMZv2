const STORAGE_KEY = "trademindmz-ai-cost-control";

const DEFAULT_COST_CONTROL = {
  maxCallsPerHour: 20,
  maxCallsPerDay: 200,
  cacheMinutes: 15,
  requireRecommendedThreshold: 75,
};

export function getAICostControl() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "{}"
    );

    return {
      ...DEFAULT_COST_CONTROL,
      ...saved,
    };
  } catch {
    return {
      ...DEFAULT_COST_CONTROL,
    };
  }
}

export function saveAICostControl(settings) {
  const next = {
    ...getAICostControl(),
    ...settings,
  };

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(next)
  );

  return next;
}
