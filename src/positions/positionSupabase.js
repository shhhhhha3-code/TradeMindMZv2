const API_BASE = "/api/positions";

async function parseResponse(response) {
  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || body?.success === false) {
    throw new Error(
      body?.error ||
      `Position API request failed (${response.status})`
    );
  }

  return body;
}

export async function savePositionToSupabase(position) {
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(position),
  });

  const body = await parseResponse(response);

  return body.position;
}

export async function loadPositionsFromSupabase({
  userId = null,
  status = "LIVE",
} = {}) {
  const params = new URLSearchParams();

  if (userId) {
    params.set("userId", userId);
  }

  if (status) {
    params.set("status", status);
  }

  const query = params.toString();

  const response = await fetch(
    query
      ? `${API_BASE}?${query}`
      : API_BASE
  );

  const body = await parseResponse(response);

  return body.positions || [];
}

export async function updatePositionInSupabase(
  positionId,
  updates
) {
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(positionId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates || {}),
    }
  );

  const body = await parseResponse(response);

  return body.position;
}
