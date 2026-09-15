import React, { useMemo, useState } from "react";

function normalizeSymbol(symbol = "") {
  return String(symbol)
    .toUpperCase()
    .replace(/[_-].*$/, "")
    .replace(/USDT.*$/, "")
    .replace(/USDC.*$/, "")
    .replace(/USD.*$/, "")
    .replace(/PERP$/, "")
    .trim();
}

export default function CoinLogo({
  symbol,
  size = 34,
  className = ""
}) {
  const coin = useMemo(
    () => normalizeSymbol(symbol),
    [symbol]
  );

  const [failed, setFailed] = useState(false);

  const candidates = [
    `/assets/coins/${coin}.png`,
    `/assets/coins/${coin}.webp`,
    `/assets/coins/${coin}.jpg`,
    `/assets/coins/${coin}.svg`
  ];

  const [index, setIndex] = useState(0);

  if (!coin || failed) {
    return (
      <div
        className={`tmz-coin-fallback ${className}`}
        style={{
          width: size,
          height: size
        }}
        aria-label={coin || "coin"}
      >
        {coin?.slice(0, 2) || "•"}
      </div>
    );
  }

  return (
    <div
      className={`tmz-coin-logo ${className}`}
      style={{
        width: size,
        height: size
      }}
    >
      <img
        src={candidates[index]}
        alt={coin}
        onError={() => {
          if (index < candidates.length - 1) {
            setIndex(index + 1);
          } else {
            setFailed(true);
          }
        }}
      />
    </div>
  );
}
