import React from "react";

export default function TradingModeToggle({ value = "PERP", onChange }) {
  const mode = String(value || "PERP").toUpperCase() === "SPOT" ? "SPOT" : "PERP";

  return (
    <div
      role="group"
      aria-label="Trading mode"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px",
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,.10)",
        background: "rgba(255,255,255,.035)",
      }}
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
          style={{
            border: "0",
            borderRadius: "7px",
            padding: "7px 10px",
            background: mode === key ? "rgba(191,255,0,.14)" : "transparent",
            color: mode === key ? "#bfff00" : "rgba(255,255,255,.55)",
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: ".06em",
            cursor: "pointer",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
