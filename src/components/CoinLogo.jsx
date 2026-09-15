import React, {
  useMemo,
  useState,
} from "react";

function normalizeSymbol(
  symbol = ""
) {
  return String(symbol)
    .toUpperCase()
    .replace(/[_-].*$/, "")
    .replace(/USDT.*$/, "")
    .replace(/USDC.*$/, "")
    .replace(/USD.*$/, "")
    .replace(/PERP$/, "")
    .trim();
}

function remoteLogoFor(
  coin
) {
  const map = {
    BTC:
      "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
    ETH:
      "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
    SOL:
      "https://assets.coingecko.com/coins/images/4128/large/solana.png",
    DOGE:
      "https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
    XRP:
      "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
    ADA:
      "https://assets.coingecko.com/coins/images/975/large/cardano.png",
    LINK:
      "https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
    LTC:
      "https://assets.coingecko.com/coins/images/2/large/litecoin.png",
    DOT:
      "https://assets.coingecko.com/coins/images/12171/large/polkadot.png",
    AVAX:
      "https://assets.coingecko.com/coins/images/12559/large/coin-round-red.png",
  };

  return map[coin] || null;
}

export default function CoinLogo({
  symbol,
  size = 34,
  className = "",
}) {
  const coin =
    useMemo(
      () =>
        normalizeSymbol(
          symbol
        ),
      [symbol]
    );

  const candidates =
    useMemo(() => {
      const result = [
        `/assets/coins/${coin}.png`,
        `/assets/coins/${coin}.webp`,
        `/assets/coins/${coin}.jpg`,
        `/assets/coins/${coin}.svg`,
      ];

      const remote =
        remoteLogoFor(coin);

      if (remote) {
        result.push(remote);
      }

      return result;
    }, [coin]);

  const [
    index,
    setIndex
  ] = useState(0);

  const [
    failed,
    setFailed
  ] = useState(false);

  if (!coin || failed) {
    return (
      <div
        className={
          `tmz-coin-fallback ${className}`
        }
        style={{
          width: size,
          height: size,
        }}
      >
        {coin?.slice(0, 2) || "•"}
      </div>
    );
  }

  return (
    <div
      className={
        `tmz-coin-logo ${className}`
      }
      style={{
        width: size,
        height: size,
      }}
    >
      <img
        src={candidates[index]}
        alt={coin}
        loading="lazy"
        onError={() => {
          if (
            index <
            candidates.length - 1
          ) {
            setIndex(
              index + 1
            );
          } else {
            setFailed(true);
          }
        }}
      />
    </div>
  );
}
