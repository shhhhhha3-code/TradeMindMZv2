import React, { useMemo } from "react";

export default function MarketSparkline({
  values = [],
  positive = true,
  height = 58
}) {
  const points = useMemo(() => {
    const nums = values
      .map(Number)
      .filter(Number.isFinite);

    if (nums.length < 2) {
      return "";
    }

    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const range = max - min || 1;

    return nums
      .map((value, i) => {
        const x =
          (i / (nums.length - 1)) * 100;

        const y =
          8 +
          (1 - (value - min) / range) * 82;

        return `${x},${y}`;
      })
      .join(" ");
  }, [values]);

  if (!points) {
    return (
      <div
        className="tmz-sparkline-empty"
        style={{ height }}
      />
    );
  }

  const stroke =
    positive
      ? "var(--tm-accent-green)"
      : "var(--tm-accent-red)";

  return (
    <svg
      className="tmz-sparkline"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="2.2"
        vectorEffect="non-scaling-stroke"
      />

      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="9"
        opacity=".06"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
