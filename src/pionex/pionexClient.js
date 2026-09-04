const SERVER_URL =
  import.meta.env.VITE_AI_SERVER_URL ||
  "";

export async function getPionexStatus() {
  const response =
    await fetch(
      `${SERVER_URL}/api/pionex/status`
    );

  if (!response.ok) {
    throw new Error(
      `Pionex status failed: ${response.status}`
    );
  }

  return response.json();
}

export async function getPionexAccount() {
  const response =
    await fetch(
      `${SERVER_URL}/api/pionex/account`
    );

  if (!response.ok) {
    throw new Error(
      `Pionex account request failed: ${response.status}`
    );
  }

  return response.json();
}

export async function getPionexPositions() {
  const response =
    await fetch(
      `${SERVER_URL}/api/pionex/positions`
    );

  if (!response.ok) {
    throw new Error(
      `Pionex positions request failed: ${response.status}`
    );
  }

  return response.json();
}
