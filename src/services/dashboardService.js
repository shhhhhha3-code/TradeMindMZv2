async function readJson(response) {
  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Invalid dashboard response (${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Dashboard request failed (${response.status})`
    );
  }

  return data;
}

export async function fetchDashboardData() {
  const [
    learningResponse,
    positionsResponse,
    historyResponse
  ] = await Promise.all([
    fetch("/api/ai/learning-stats"),
    fetch("/api/positions"),
    fetch("/api/ai/signal-history?limit=10")
  ]);

  const [
    learning,
    positions,
    history
  ] = await Promise.all([
    readJson(learningResponse),
    readJson(positionsResponse),
    readJson(historyResponse)
  ]);

  return {
    learning,
    positions,
    history
  };
}
