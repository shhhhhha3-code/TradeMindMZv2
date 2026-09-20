function providers() {
  const result = [];
  if (Deno.env.get("GROQ_API_KEY")) result.push("groq");
  if (Deno.env.get("OPENAI_API_KEY")) result.push("openai");
  return result;
}

async function callGroq(payload) {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("Groq API key is not configured.");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-120b",
      temperature: 0.1,
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      max_completion_tokens: 700,
      messages: [{ role: "system", content: payload.systemPrompt }, { role: "user", content: payload.userPrompt }],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Groq request failed: ${response.status} ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

async function callOpenAI(payload) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OpenAI API key is not configured.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: payload.systemPrompt }, { role: "user", content: payload.userPrompt }],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status} ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

async function callProvider(provider, payload) {
  if (provider === "groq") return callGroq(payload);
  if (provider === "openai") return callOpenAI(payload);
  throw new Error(`Unsupported AI provider: ${provider}`);
}

function buildTradeExplanation(candidate, aiDecision) {
  const direction = String(candidate?.direction || "").toUpperCase();
  const side = direction === "SHORT" ? "SELL" : "BUY";
  const score = Number(candidate?.engineScore ?? candidate?.score);
  const confidence = Number(candidate?.confidence);
  const rr = Number(candidate?.riskReward);
  const rsi = Number(candidate?.rsi ?? candidate?.indicators?.rsi14);
  const volume = Number(candidate?.volumeRatio ?? candidate?.indicators?.volumeRatio);
  const ema9 = Number(candidate?.ema9 ?? candidate?.indicators?.ema9);
  const ema21 = Number(candidate?.ema21 ?? candidate?.indicators?.ema21);
  const change24h = Number(candidate?.change24h ?? candidate?.indicators?.change24h);
  const factors = [];
  const invalidation = [];

  if (Number.isFinite(score)) factors.push(`Engine score ${Math.round(score)}/100 supports the setup.`);
  if (Number.isFinite(confidence)) factors.push(`Engine confidence is ${Math.round(confidence)}%.`);
  if (Number.isFinite(rr)) factors.push(`Risk/reward is ${rr.toFixed(2)}:1.`);
  if (Number.isFinite(rsi)) factors.push(`RSI is ${rsi.toFixed(1)}, inside the trade zone.`);
  if (Number.isFinite(volume)) factors.push(`Volume is ${volume.toFixed(2)}× the reference level.`);

  if (Number.isFinite(ema9) && Number.isFinite(ema21)) {
    const emaBull = ema9 > ema21;
    const aligned = direction === "SHORT" ? !emaBull : emaBull;
    factors.push(aligned
      ? `EMA structure supports ${side}: EMA9 ${ema9 > ema21 ? "above" : "below"} EMA21.`
      : `EMA structure is not fully aligned with ${side}.`);
    invalidation.push(direction === "SHORT"
      ? "EMA9 moving back above EMA21 would weaken the SELL setup."
      : "EMA9 moving back below EMA21 would weaken the BUY setup.");
  }

  if (Number.isFinite(change24h)) {
    factors.push(`24h price change is ${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%.`);
    invalidation.push(direction === "SHORT"
      ? "A sustained reversal higher would weaken the SELL thesis."
      : "A sustained reversal lower would weaken the BUY thesis.");
  }

  if (Number.isFinite(rr)) {
    invalidation.push(`Risk/reward falling below 2:1 removes the trade-quality edge.`);
  }
  if (Number.isFinite(rsi)) {
    invalidation.push(direction === "SHORT"
      ? "RSI moving above the permitted zone can invalidate the SELL setup."
      : "RSI moving outside the permitted zone can invalidate the BUY setup.");
  }
  if (Number.isFinite(volume) && volume < 1) {
    invalidation.push("Volume falling below the reference level would weaken confirmation.");
  }
  if (Number.isFinite(candidate?.stopLoss)) {
    invalidation.push(`Price reaching the defined stop loss (${candidate.stopLoss}) invalidates the setup.`);
  }

  const unique = (items) => [...new Set(items.filter(Boolean))];
  const supportingFactors = unique(factors).slice(0, 6);
  const invalidationFactors = unique(invalidation).slice(0, 5);

  return {
    side,
    decisionSummary: String(aiDecision?.reason || `${side} setup passes the deterministic trade-quality checks and AI review.`),
    supportingFactors,
    invalidationFactors,
    tradeQualitySummary: `Score ${Number.isFinite(score) ? Math.round(score) : "—"} • AI confidence ${Number.isFinite(Number(aiDecision?.confidence)) ? Math.round(Number(aiDecision.confidence)) : "—"}% • R/R ${Number.isFinite(rr) ? rr.toFixed(2) : "—"}`,
  };
}

function hardBlocks(candidate) {
  const score = Number(candidate?.engineScore ?? candidate?.score);
  const confidence = Number(candidate?.confidence);
  const rr = Number(candidate?.riskReward);
  const rsi = Number(candidate?.rsi ?? candidate?.indicators?.rsi14);
  const volume = Number(candidate?.volumeRatio ?? candidate?.indicators?.volumeRatio);
  const risk = String(candidate?.risk?.level ?? candidate?.riskLevel ?? "").toUpperCase();
  const reasons = [];
  if (Number.isFinite(score) && score < 75) reasons.push("ENGINE_SCORE_BELOW_MINIMUM");
  if (Number.isFinite(confidence) && confidence < 80) reasons.push("CONFIDENCE_BELOW_MINIMUM");
  if (Number.isFinite(rr) && rr < 2) reasons.push("RISK_REWARD_BELOW_MINIMUM");
  if (Number.isFinite(rsi) && (rsi < 35 || rsi > 70)) reasons.push("RSI_OUTSIDE_RANGE");
  if (Number.isFinite(volume) && volume < 0.8) reasons.push("VOLUME_BELOW_MINIMUM");
  if (risk === "HIGH") reasons.push("ENGINE_HIGH_RISK");
  return reasons;
}

async function runDecision(candidates = [], preferredProvider = "groq") {
  const top = Array.isArray(candidates) ? candidates.slice(0, 5) : [];
  if (!top.length) return { success: false, decision: "NO_TRADE", symbol: null, confidence: 0, risk: "HIGH", reason: "No candidates supplied.", provider: null, blockedByEngine: true };

  const eligible = top.filter((candidate) => hardBlocks(candidate).length === 0);
  if (!eligible.length) {
    return {
      success: true,
      decision: "NO_TRADE",
      symbol: top[0]?.symbol || null,
      confidence: 0,
      risk: "HIGH",
      reason: "No Engine TOP 5 candidate passed all deterministic trade criteria.",
      provider: null,
      blockedByEngine: true,
      engineReasons: [...new Set(top.flatMap(hardBlocks))],
    };
  }

  const available = providers();
  if (!available.length) {
    return { success: false, decision: "NO_TRADE", symbol: eligible[0]?.symbol || null, confidence: 0, risk: "HIGH", reason: "No configured AI provider is available.", provider: null, blockedByEngine: false };
  }

  const ordered = [preferredProvider, Deno.env.get("AI_DEFAULT_PROVIDER") || "groq", ...available]
    .filter((p, i, list) => p && available.includes(p) && list.indexOf(p) === i);

  // Keep the Decision Layer prompt compact. The Engine candidates contain
  // chart/sparkline arrays and other diagnostic payloads that are useful to
  // the app but unnecessary for the AI decision. Sending those large arrays
  // can consume the provider token budget and make an otherwise healthy
  // Groq/OpenAI request fail.
  const aiCandidates = top.map((candidate) => ({
    symbol: candidate?.symbol || null,
    direction: candidate?.direction || null,
    price: candidate?.price ?? null,
    entry: candidate?.entry ?? null,
    stopLoss: candidate?.stopLoss ?? null,
    takeProfit: candidate?.takeProfit ?? null,
    engineScore: candidate?.engineScore ?? candidate?.score ?? null,
    confidence: candidate?.confidence ?? null,
    riskReward: candidate?.riskReward ?? null,
    change24h: candidate?.change24h ?? candidate?.indicators?.change24h ?? null,
    timeframe: candidate?.timeframe ?? null,
    rsi: candidate?.rsi ?? candidate?.indicators?.rsi14 ?? null,
    volumeRatio: candidate?.volumeRatio ?? candidate?.indicators?.volumeRatio ?? null,
    ema9: candidate?.ema9 ?? candidate?.indicators?.ema9 ?? null,
    ema21: candidate?.ema21 ?? candidate?.indicators?.ema21 ?? null,
    macd: candidate?.macd ?? candidate?.indicators?.macd ?? null,
    riskLevel: candidate?.risk?.level ?? candidate?.riskLevel ?? null,
  }));

  const payload = {
    systemPrompt: `You are the TradeMindMZ AI Decision Layer. A deterministic TradeMindMZ Engine has already evaluated the market candidates. Evaluate ONLY the supplied candidates. Never invent market data. Engine rules are hard: score >= 75, confidence >= 80, risk/reward >= 2, RSI 35-70, volume ratio >= 0.8, and HIGH risk cannot be selected. Return JSON only: {"decision":"TRADE|WATCH|NO_TRADE","symbol":"SYMBOL","confidence":0,"risk":"LOW|MEDIUM|HIGH","reason":"short explanation","holdTimeMinMinutes":0,"holdTimeMaxMinutes":0,"holdTimeReason":"brief reason based only on supplied timeframe, volatility, entry/TP distance and momentum"}. Only provide a meaningful hold-time range when decision is TRADE; otherwise use 0/0 and an empty reason. Hold time is an estimate, not a guarantee.`,
    userPrompt: `TradeMindMZ Engine TOP 5:\n\n${JSON.stringify(aiCandidates)}`,
  };

  const errors = [];
  for (const provider of ordered) {
    try {
      const raw = await callProvider(provider, payload);
      const symbol = String(raw?.symbol || "").toUpperCase();
      const selected = eligible.find((candidate) => String(candidate?.symbol || "").toUpperCase() === symbol) || eligible[0];
      const blocks = hardBlocks(selected);
      if (blocks.length) {
        errors.push({ provider, error: "AI selected a blocked candidate." });
        continue;
      }
      let decision = String(raw?.decision || "NO_TRADE").toUpperCase();
      if (!["TRADE", "WATCH", "NO_TRADE"].includes(decision)) decision = "NO_TRADE";
      const confidence = Math.max(0, Math.min(100, Number(raw?.confidence ?? selected?.confidence ?? 0) || 0));
      if (decision === "TRADE" && confidence < 80) decision = "WATCH";
      return {
        success: true,
        decision,
        symbol: selected?.symbol || null,
        confidence,
        risk: String(raw?.risk || selected?.risk?.level || "MEDIUM").toUpperCase(),
        reason: String(raw?.reason || "AI cross-check completed."),
        provider,
        engineScore: selected?.engineScore ?? selected?.score ?? null,
        engineRisk: selected?.risk ?? null,
        engineCandidate: selected,
        blockedByEngine: false,
        providers: available,
        providerErrors: errors,
        holdTimeMinMinutes:
          decision === "TRADE"
            ? Math.max(1, Math.round(Number(raw?.holdTimeMinMinutes) || 0))
            : 0,
        holdTimeMaxMinutes:
          decision === "TRADE"
            ? Math.max(
                Math.round(Number(raw?.holdTimeMinMinutes) || 0),
                Math.round(Number(raw?.holdTimeMaxMinutes) || 0)
              )
            : 0,
        holdTimeReason:
          decision === "TRADE"
            ? String(raw?.holdTimeReason || "")
            : "",
      };
    } catch (error) {
      errors.push({ provider, error: error?.message || String(error) });
    }
  }

  return { success: false, decision: "NO_TRADE", symbol: eligible[0]?.symbol || null, confidence: 0, risk: "HIGH", reason: "All configured AI providers failed during the Decision Layer.", provider: null, blockedByEngine: false, providers: available, providerErrors: errors };
}

export { runDecision, hardBlocks };
