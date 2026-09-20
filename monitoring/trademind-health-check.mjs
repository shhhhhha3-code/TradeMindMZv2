const baseUrl = (process.env.API_BASE_URL || "https://imnnpilqjzfhvijhipzu.supabase.co/functions/v1/trademind-api").replace(/\\/$/, "");

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return { response, data };
}

const diagnostics = await getJson("/api/diagnostics");
if (!diagnostics.response.ok) {
  throw new Error(`Diagnostics HTTP ${diagnostics.response.status}`);
}

const marketAi = diagnostics.data?.checks?.find((check) => check.name === "Market AI");
const pionex = diagnostics.data?.checks?.find((check) => check.name === "Pionex");

console.log("TradeMindMZ health check");
console.log("  diagnostics:", diagnostics.data?.status || "UNKNOWN");
console.log("  market AI:", marketAi?.status || "UNKNOWN");
console.log("  Pionex:", pionex?.status || "UNKNOWN");
console.log("  snapshot age:", marketAi?.details?.snapshotAgeSeconds ?? "n/a", "seconds");
console.log("  candidates:", marketAi?.details?.candidates ?? 0);
console.log("  provider:", marketAi?.details?.provider || "n/a");
console.log("  decision:", marketAi?.details?.finalDecision || "NO_TRADE");

if (diagnostics.data?.success !== true) {
  throw new Error(`Diagnostics reported a problem: ${diagnostics.data?.status || "unknown"}`);
}

if (marketAi?.status !== "OK") {
  throw new Error(`Market AI is not healthy: ${marketAi?.status || "unknown"}`);
}

if (pionex?.status !== "OK") {
  throw new Error(`Pionex is not healthy: ${pionex?.status || "unknown"}`);
}

const latest = await getJson("/api/ai/latest?interval=15M&marketType=PERP&leverage=2");
if (!latest.response.ok || latest.data?.success !== true || latest.data?.available !== true) {
  throw new Error("Latest persisted AI snapshot is unavailable.");
}

const candidates = latest.data?.snapshot?.candidates;
if (!Array.isArray(candidates) || candidates.length < 5) {
  throw new Error(`Latest snapshot contains fewer than 5 candidates: ${candidates?.length || 0}`);
}

console.log("  latest snapshot:", latest.data.snapshot.persistedAt || latest.data.snapshot.updatedAt || "unknown");
console.log("HEALTH CHECK PASSED");
