async function readJson(response) {
  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Invalid learning response (${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Learning request failed (${response.status})`
    );
  }

  return data;
}

export async function fetchLearningStats() {
  const response = await fetch(
    "/api/ai/learning-stats",
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    }
  );

  return readJson(response);
}
