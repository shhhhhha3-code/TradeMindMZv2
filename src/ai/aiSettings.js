const DEFAULT_AI_SETTINGS = {
  ai: true,
  openai: true,
  groq: true,
  learning: true,
  automaticParameterOptimization: false,
  aiLearningLifecycle: false,
};

const STORAGE_KEY = "trademindmz-ai-settings";

export function getAISettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...DEFAULT_AI_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function isAIEnabled() {
  return getAISettings().ai === true;
}

export function isOpenAIEnabled() {
  const settings = getAISettings();
  return settings.ai === true && settings.openai === true;
}

export function isGroqEnabled() {
  const settings = getAISettings();
  return settings.ai === true && settings.groq === true;
}

export function isHistoricalLearningEnabled() {
  return getAISettings().learning === true;
}

export function isAutomaticParameterOptimizationEnabled() {
  const settings = getAISettings();
  return settings.ai === true && settings.automaticParameterOptimization === true;
}

export function isAiLearningLifecycleEnabled() {
  const settings = getAISettings();
  return settings.ai === true && settings.learning === true && settings.aiLearningLifecycle === true;
}

export function getAiControlMode() {
  const settings = getAISettings();
  return isAutomaticParameterOptimizationEnabled() && isAiLearningLifecycleEnabled()
    ? "FULL_AI_CONTROL"
    : "GUIDED_AI_CONTROL";
}

export function getEnabledProviders() {
  const providers = [];

  if (isOpenAIEnabled()) providers.push("openai");
  if (isGroqEnabled()) providers.push("groq");

  return providers;
}
