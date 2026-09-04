async function readJson(response) {
  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Invalid history response (${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `History request failed (${response.status})`
    );
  }

  return data;
}

export async function fetchSignalHistory(
  limit = 50
) {
  const response = await fetch(
    `/api/ai/signal-history?limit=${encodeURIComponent(limit)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    }
  );

  return readJson(response);
}
