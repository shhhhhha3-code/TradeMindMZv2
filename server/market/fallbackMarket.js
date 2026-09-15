const CACHE_TTL_MS = 30000;

let cache = null;

const COINS = [
  {
    id: "bitcoin",
    symbol: "BTC",
  },
  {
    id: "ethereum",
    symbol: "ETH",
  },
  {
    id: "solana",
    symbol: "SOL",
  },
  {
    id: "dogecoin",
    symbol: "DOGE",
  },
  {
    id: "ripple",
    symbol: "XRP",
  },
  {
    id: "cardano",
    symbol: "ADA",
  },
  {
    id: "chainlink",
    symbol: "LINK",
  },
  {
    id: "litecoin",
    symbol: "LTC",
  },
  {
    id: "polkadot",
    symbol: "DOT",
  },
  {
    id: "avalanche-2",
    symbol: "AVAX",
  },
];

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

async function fetchWithTimeout(
  url,
  timeoutMs = 10000
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent":
          "TradeMindMZ/1.0",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function getFallbackMarket() {
  if (
    cache &&
    Date.now() - cache.timestamp <
      CACHE_TTL_MS
  ) {
    return cache.value;
  }

  const ids =
    COINS.map(
      coin => coin.id
    ).join(",");

  const url =
    "https://api.coingecko.com/api/v3/coins/markets" +
    "?vs_currency=usd" +
    `&ids=${encodeURIComponent(ids)}` +
    "&order=volume_desc" +
    "&per_page=50" +
    "&page=1" +
    "&sparkline=true" +
    "&price_change_percentage=1h,24h,7d";

  let response;

  try {
    response =
      await fetchWithTimeout(
        url
      );
  } catch (error) {
    return {
      success: true,
      source:
        "FALLBACK_UNAVAILABLE",
      delayed: true,
      updatedAt:
        new Date().toISOString(),
      candidates: [],
      error:
        error instanceof Error
          ? error.message
          : "Fallback market request failed.",
    };
  }

  if (!response.ok) {
    return {
      success: true,
      source:
        "FALLBACK_UNAVAILABLE",
      delayed: true,
      updatedAt:
        new Date().toISOString(),
      candidates: [],
      error:
        `Fallback market request failed: HTTP ${response.status}`,
    };
  }

  let rows;

  try {
    rows =
      await response.json();
  } catch {
    return {
      success: true,
      source:
        "FALLBACK_UNAVAILABLE",
      delayed: true,
      updatedAt:
        new Date().toISOString(),
      candidates: [],
      error:
        "Fallback market returned invalid JSON.",
    };
  }

  const candidates =
    Array.isArray(rows)
      ? rows.map((coin, index) => ({
          rank: index + 1,
          id: coin.id,
          symbol:
            `${String(
              coin.symbol || ""
            ).toUpperCase()}_USDT`,
          baseSymbol:
            String(
              coin.symbol || ""
            ).toUpperCase(),
          name:
            coin.name || "Unknown",

          price:
            Number(
              coin.current_price
            ),

          change1h:
            Number(
              coin.price_change_percentage_1h_in_currency
            ),

          change24h:
            Number(
              coin.price_change_percentage_24h_in_currency
            ),

          change7d:
            Number(
              coin.price_change_percentage_7d_in_currency
            ),

          volume24h:
            Number(
              coin.total_volume
            ),

          marketCap:
            Number(
              coin.market_cap
            ),

          image:
            coin.image || null,

          sparkline:
            Array.isArray(
              coin?.sparkline_in_7d?.price
            )
              ? coin.sparkline_in_7d.price
              : [],

          source:
            "FALLBACK_MARKET_DATA",
        }))
        .filter(
          coin =>
            Number.isFinite(
              coin.price
            )
        )
      : [];

  const result = {
    success: true,
    source:
      "FALLBACK_MARKET_DATA",
    delayed: false,
    updatedAt:
      new Date().toISOString(),
    candidates:
      candidates.slice(0, 10),
  };

  cache = {
    timestamp: Date.now(),
    value: result,
  };

  return result;
}
