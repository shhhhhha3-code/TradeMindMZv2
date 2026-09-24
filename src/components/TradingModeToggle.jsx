import React from "react";

export default function TradingModeToggle({ value = "PERP", onChange }) {
  const mode = String(value || "PERP").toUpperCase() === "SPOT" ? "SPOT" : "PERP";

  return (
    <div
      className="tmz-mode-toggle"
      role="group"
      aria-label="Trading mode"
    >
      {[
        ["SPOT", "SPOT"],
        ["PERP", "USDT-M"],
      ].map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange?.(key)}
          aria-pressed={mode === key}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
