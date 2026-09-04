import React from "react";
import TradeMindV3Brand from "./TradeMindV3Brand";

export default function TradeMindV3Shell() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -left-32 top-20 h-96 w-96 rounded-full bg-emerald-400/5 blur-3xl" />
      <div className="absolute -right-32 top-1/4 h-[28rem] w-[28rem] rounded-full bg-violet-500/5 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-cyan-400/4 blur-3xl" />
    </div>
  );
}
