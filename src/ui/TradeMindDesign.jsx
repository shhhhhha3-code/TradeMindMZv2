import React from "react";
import {
  Activity,
  BrainCircuit,
  ChevronRight,
  History,
  LayoutDashboard,
  LineChart,
  Menu,
  Bell,
  RefreshCw,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
  X,
  Zap,
  Radio,
} from "lucide-react";

export default function TradeMindDesign({
  tab,
  setTab,
  trackedPositions = [],
  children,
}) {
  const navigation = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["signals", "AI Signals", BrainCircuit],
    ["positions", "Live Positions", Activity],
    ["market", "Market Overview", LineChart],
    ["history", "Signal History", History],
  ];

  const title =
    tab === "signals"
      ? "AI Signals"
      : tab === "positions"
        ? "Live Positions"
        : tab === "market"
          ? "Market Overview"
          : tab === "history"
            ? "Signal History"
            : tab === "settings"
              ? "Settings"
              : "Dashboard";

  return (
    <div className="app">
      <aside className="side">
        <div className="sidehead">
          <div className="brand">
            <div className="logo">
              <i />
              <i />
              <b />
            </div>

            <div>
              <strong>
                TRADEMIND<span>MZ</span>
              </strong>

              <small>
                AI MARKET INTELLIGENCE
              </small>
            </div>
          </div>
        </div>

        <div className="online">
          <i />

          <div>
            <b>AI ENGINE ONLINE</b>
            <small>
              Learning from live market data
            </small>
          </div>
        </div>

        <nav>
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              className={
                tab === id
                  ? "active"
                  : ""
              }
              onClick={() => setTab(id)}
            >
              <Icon />
              <span>{label}</span>

              {id === "positions" && (
                <em>
                  {trackedPositions.filter(
                    (p) =>
                      p.status === "LIVE"
                  ).length}
                </em>
              )}
            </button>
          ))}
        </nav>

        <div className="bottom">
          <button
            onClick={() =>
              setTab("settings")
            }
          >
            <ShieldCheck />
            <span>Pionex Connection</span>
            <i />
          </button>

          <button
            onClick={() =>
              setTab("settings")
            }
          >
            <Settings />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      <main>
        <header>
          <button className="hamb">
            <Menu />
          </button>

          <div className="mobilelogo">
            <div className="brand">
              <div className="logo">
                <i />
                <i />
                <b />
              </div>

              <div>
                <strong>
                  TRADEMIND<span>MZ</span>
                </strong>

                <small>
                  AI MARKET INTELLIGENCE
                </small>
              </div>
            </div>
          </div>

          <div className="title">
            <small>TRADEMINDMZ</small>
            <b>{title}</b>
          </div>

          <div className="actions">
            <span className="live">
              <i />
              AI LIVE
            </span>

            <button className="bell">
              <Bell />
            </button>

            <button className="avatar">
              MZ
            </button>
          </div>
        </header>

        <section>
          {children}
        </section>
      </main>
    </div>
  );
}
