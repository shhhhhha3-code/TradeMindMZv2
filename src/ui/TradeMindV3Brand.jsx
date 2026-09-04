import React from "react";

export default function TradeMindV3Brand({
  subtitle = "AI POWERED CRYPTO TRADING",
  compact = false,
}) {
  return (
    <div
      className={`flex items-center gap-3 ${
        compact ? "py-1" : "py-2"
      }`}
    >
      <img
        src="/assets/trademindmz-logo.svg"
        alt="TradeMindMZ"
        className="tmz-v3-logo"
      />

      <div className="min-w-0">
        <div className="tmz-v3-title tmz-v3-brand text-lg font-black sm:text-xl">
          TRADEMINDMZ
        </div>

        {!compact && (
          <div className="mt-0.5 text-[10px] font-semibold tracking-[0.24em] text-slate-400">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
