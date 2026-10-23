"use client";

import { useState } from "react";
import { Sakura, Mascot } from "./visuals";
import { usd, pct, signed, tone, price, timeAgo } from "../lib/format";
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from "recharts";

/* ═══════════════════════════════════════════════════════════════════════════
   NAV
   ═══════════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: "overview",   label: "Overview",   icon: "◎" },
  { id: "positions",  label: "Positions",  icon: "⬡" },
  { id: "episodes",   label: "Episodes",   icon: "↻" },
  { id: "evolution",  label: "Evolution",  icon: "△" },
  { id: "strategies", label: "Strategies", icon: "♟" },
  { id: "world",      label: "World",      icon: "◐" },
  { id: "lessons",    label: "Lessons",    icon: "✦" },
  { id: "trades",     label: "Trades",     icon: "⇄" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/* helpers */
function sym(s: string) { return s?.replace("-USD", "") ?? ""; }
function cl(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)); }

function statusColor(s: string) {
  switch (s) {
    case "active":    return "bg-up/15 text-upink border-up/30";
    case "candidate": return "bg-lavsoft/30 text-lav border-lav/30";
    case "probation": return "bg-gold/15 text-gold border-gold/30";
    case "retired":   return "bg-down/15 text-downink border-down/30";
    default:          return "bg-cream2 text-inksoft border-cream2";
  }
}

function fngColor(label: string | undefined) {
  if (!label) return "text-inksoft";
  const l = label.toLowerCase().replace(/_/g, " ");
  if (l.includes("extreme fear"))  return "text-downink";
  if (l.includes("fear"))          return "text-down";
  if (l.includes("extreme greed")) return "text-upink";
  if (l.includes("greed"))         return "text-up";
  return "text-gold";
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════════ */
export default function DashboardV2({ data }: { data: any }) {
  const [tab, setTab] = useState<TabId>("overview");
  const v2         = data?.v2 ?? {};
  const sig        = v2.signals ?? {};
  const episodes   = v2.episodes ?? [];
  const generations= v2.generations ?? [];
  const strategies = v2.strategies ?? [];
  const memory     = v2.memory ?? [];
  const equity     = v2.equity ?? [];
  const trades     = v2.trades ?? [];
  const config     = v2.config ?? {};

  const view = (() => {
    switch (tab) {
      case "overview":   return <OverviewView   sig={sig} episodes={episodes} equity={equity} config={config} />;
      case "positions":  return <PositionsView  sig={sig} />;
      case "episodes":   return <EpisodesView   episodes={episodes} sig={sig} />;
      case "evolution":  return <EvolutionView  generations={generations} />;
      case "strategies": return <StrategiesView strategies={strategies} />;
      case "world":      return <WorldView      sig={sig} />;
      case "lessons":    return <LessonsView    memory={memory} />;
      case "trades":     return <TradesView     trades={trades} sig={sig} />;
    }
  })();

  return (
    <div className="min-h-screen relative">
      <Sakura />
      <DesktopSidebar tab={tab} setTab={setTab} />
      <MobileBar tab={tab} setTab={setTab} />
      <main className="md:ml-56 px-4 md:px-6 pb-16 pt-3 md:pt-6 max-w-6xl">{view}</main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SIDEBAR (desktop)
   ═══════════════════════════════════════════════════════════════════════ */
function DesktopSidebar({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 flex-col bg-cream/60 backdrop-blur-xl border-r border-white/50 z-30 px-4 pt-6 pb-5">
      {/* Badge + name */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-display text-lg font-bold shadow-md"
          style={{ background: "linear-gradient(135deg,#ff9eaa,#e3c16f)" }}
        >
          F
        </div>
        <div>
          <p className="text-sm font-bold text-ink leading-tight">Tradio</p>
          <p className="text-[10px] text-inksoft leading-tight">Apex Trading Bot · v2</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-sakura/15 text-ink shadow-sm"
                : "text-inksoft hover:bg-white/40 hover:text-ink"
            }`}
          >
            <span className="text-base w-5 text-center opacity-70">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Disclaimer */}
      <p className="text-[9px] leading-snug text-inksoft/70 mt-4 px-1">
        Simulation on real live prices. Fake money, real lessons. Honest by design,
        it can lose everything, it never lies.
      </p>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE BAR
   ═══════════════════════════════════════════════════════════════════════ */
function MobileBar({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  return (
    <nav className="md:hidden sticky top-0 z-20 flex overflow-x-auto gap-2 px-4 py-2.5 bg-cream/70 backdrop-blur-lg border-b border-white/40">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`pill shrink-0 px-3 py-1.5 text-xs font-medium transition-all ${
            tab === t.id ? "bg-sakura/20 text-ink border-sakura/40" : "text-inksoft"
          }`}
        >
          <span className="mr-1">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED: Interactive Equity Chart (Recharts)
   ═══════════════════════════════════════════════════════════════════════ */
function EquityChart({ data, height = 80 }: { data: number[]; height?: number }) {
  if (!data || data.length < 2) return <div style={{ height }} className="bg-cream2/40 rounded" />;
  
  const chartData = data.map((v, i) => ({ index: i, equity: v }));
  const min = Math.min(...data);
  const max = Math.max(...data);
  const isUp = data[data.length - 1] >= data[0];
  const color = isUp ? "var(--color-upink)" : "var(--color-downink)";
  const fill = isUp ? "var(--color-up)" : "var(--color-down)";

  return (
    <div style={{ height }} className="w-full mt-2 mb-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorEq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fill} stopOpacity={0.2} />
              <stop offset="95%" stopColor={fill} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[min, max]} hide />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/20 shadow-lg">
                    <p className="text-sm font-bold tnum text-ink">{usd(payload[0].value as number)}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke={color}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorEq)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED: Fear & Greed gauge
   ═══════════════════════════════════════════════════════════════════════ */
function FnGGauge({ value, label, title }: { value: number | null; label: string; title: string }) {
  const v = value ?? 50;
  const display = (label ?? "unknown").replace(/_/g, " ");
  return (
    <div className="card-quiet p-4">
      <p className="text-[10px] uppercase tracking-wider text-inksoft mb-2">{title}</p>
      <p className={`text-lg font-bold capitalize ${fngColor(label)}`}>{display}</p>
      <div
        className="relative h-2.5 rounded-full mt-2 overflow-hidden"
        style={{ background: "linear-gradient(90deg,#e5566f,#e3c16f,#1f9d62)" }}
      >
        {value != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-ink shadow"
            style={{ left: `calc(${cl(v, 0, 100)}% - 6px)` }}
          />
        )}
      </div>
      <div className="flex justify-between text-[9px] text-inksoft mt-1">
        <span>Fear</span><span>Greed</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. OVERVIEW
   ═══════════════════════════════════════════════════════════════════════ */
function OverviewView({ sig, episodes, equity, config }: any) {
  const positions = sig.positions ?? [];
  const agg       = sig.aggression ?? {};
  const goal      = sig.goal ?? {};
  const lifetime  = sig.lifetime ?? {};
  const world     = sig.world ?? {};
  const eqVals    = equity.map((e: any) => e?.equity).filter((v: any) => v != null);

  /* goal math */
  const goalTarget  = goal.target ?? 500;
  const goalStart   = goal.startEquity ?? sig.startingCapital ?? 100;
  const progress    = goalTarget > goalStart ? cl(((sig.equity ?? 0) - goalStart) / (goalTarget - goalStart) * 100, 0, 100) : 0;
  const deadlineH   = goal.deadlineHours ?? 24;
  const hoursLeft   = Math.max(0, deadlineH - (goal.startedAt ? (Date.now() - goal.startedAt) / 3.6e6 : 0));
  const noDeadline  = deadlineH >= 1000;

  /* aggression */
  const levCap  = agg.leverageCap ?? 1;
  const levCeil = agg.leverageCeiling ?? 1;
  const kelly   = agg.kellyFraction ?? 0;
  const level   = agg.unlockedLevel ?? 0;
  const levPct  = cl((levCap / levCeil) * 100, 0, 100);

  return (
    <div className="space-y-4">
      {/* while-you-were-away */}
      <WhileAway episodes={episodes} sig={sig} />

      {/* ─── equity card ─── */}
      <div className="card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-inksoft">
              Account Equity · Episode {sig.episodeNum ?? 1}
            </p>
            <p className="font-display text-4xl md:text-5xl tracking-tight tnum text-ink mt-1">
              {usd(sig.equity)}
            </p>
            <p className={`text-sm font-semibold mt-1 tnum ${tone(sig.totalPnl)}`}>
              {signed(sig.totalPnl)} ({pct(sig.totalPnlPct)})
            </p>
            <p className="text-xs text-inksoft mt-0.5">this run · from {usd(sig.startingCapital)}</p>
          </div>
          <div className="text-right space-y-1">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-inksoft">Gross Lev </span>
              <span className="text-sm font-bold tnum text-ink">{(sig.grossLeverage ?? 0).toFixed(1)}×</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-inksoft">Max DD </span>
              <span className="text-sm font-bold tnum text-downink">{pct(sig.maxDrawdownPct)}</span>
            </div>
          </div>
        </div>

        <EquityChart data={eqVals} height={100} />

        {/* goal bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-inksoft font-medium">Goal · {usd(goalTarget, 0)}</p>
            <p className="text-[10px] text-inksoft tnum">
              {noDeadline ? "no deadline, fast as it can" : `${hoursLeft.toFixed(1)}h left`} · {progress.toFixed(0)}%
            </p>
          </div>
          <div className="h-3 rounded-full bg-cream2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.max(progress, 1)}%`,
                background: "linear-gradient(90deg,#ff9eaa,#e3c16f,#1f9d62)",
              }}
            />
          </div>
        </div>
      </div>

      {/* ─── bot card + mini positions ─── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* the bot */}
        <div className="card p-5">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <Mascot size={64} mood="happy" />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-up live-dot" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink">The Bot</p>
              <p className="text-xs text-inksoft">
                Gen {sig.generation ?? 1} · {lifetime.episodes ?? 1} run{(lifetime.episodes ?? 1) !== 1 ? "s" : ""} · {lifetime.totalBlowups ?? 0} blowup{(lifetime.totalBlowups ?? 0) !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-inksoft mt-0.5">
                Best run: {pct(lifetime.bestEpisodeReturnPct)} · Last tick: {timeAgo(sig.ts)}
              </p>
            </div>
          </div>

          {/* aggression dial */}
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider text-inksoft mb-1.5">Aggression · earned leverage</p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tnum text-ink shrink-0">{levCap}×</span>
              <div className="flex-1 h-2.5 rounded-full bg-cream2 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${levPct}%`, background: "linear-gradient(90deg,#1f9d62,#e3c16f,#e5566f)" }}
                />
              </div>
              <span className="text-xs text-inksoft tnum shrink-0">{levCeil}×</span>
            </div>
            <p className="text-xs text-inksoft mt-1.5">
              Kelly <span className="font-semibold tnum">{(kelly * 100).toFixed(0)}%</span> · Level{" "}
              <span className="font-semibold tnum">{level}</span>
            </p>
          </div>
        </div>

        {/* mini positions */}
        <div className="card-quiet p-5">
          <p className="text-[10px] uppercase tracking-widest text-inksoft mb-3">
            Open Positions · {positions.length}
          </p>
          {positions.length === 0 ? (
            <p className="text-xs text-inksoft">No open positions</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {positions.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        p.side === "long" ? "bg-up/15 text-upink" : "bg-down/15 text-downink"
                      }`}
                    >
                      {p.side === "long" ? "L" : "S"}
                    </span>
                    <span className="font-semibold text-ink truncate">{sym(p.symbol)}</span>
                    <span className="text-inksoft tnum">{p.leverage}×</span>
                  </div>
                  <span className={`font-semibold tnum shrink-0 ${tone(p.uPnl)}`}>{signed(p.uPnl)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── world mini ─── */}
      <div className="card-quiet p-5">
        <p className="text-[10px] uppercase tracking-widest text-inksoft mb-2">World</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-inksoft">
          <span>Regime: <strong className="text-ink">{sig.regime ?? "—"}</strong></span>
          <span>Crypto F&G: <strong className={fngColor(world.fearGreedCrypto?.label)}>{(world.fearGreedCrypto?.label ?? "—").replace(/_/g, " ")}</strong></span>
          <span>Whales: <strong className="text-ink">{(world.whaleCrowd ?? "—").replace(/([a-z])([A-Z])/g, "$1 $2")}</strong></span>
          <span>Funding: <strong className="text-ink tnum">{world.fundingRate ?? "—"}%</strong></span>
          <span>Thesis: <strong className="text-ink">{(world.thesis ?? "—").replace(/[|_]/g, " ")}</strong></span>
        </div>
      </div>
    </div>
  );
}

/* while-you-were-away banner */
function WhileAway({ episodes, sig }: { episodes: any[]; sig: any }) {
  if (episodes.length === 0) {
    return (
      <div className="card-quiet p-4 flex items-center gap-3">
        <span className="text-xl">🌱</span>
        <div>
          <p className="text-sm font-semibold text-ink">Run 1 in progress</p>
          <p className="text-xs text-inksoft">First episode is underway — the bot is learning.</p>
        </div>
      </div>
    );
  }
  const ep   = episodes[episodes.length - 1];
  const icon = ep.blownUp ? "💀" : ep.endReason === "goal" ? "🎯" : "✨";
  const ret  = (ep.returnPct ?? 0) * 100;

  return (
    <div className="card-quiet p-4 flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink">While you were away — Run #{ep.episodeNum}</p>
        <p className="text-xs text-inksoft">
          <span className={`font-semibold ${tone(ret)}`}>{pct(ret)}</span>
          {" · "}{timeAgo(new Date(ep.endedAt).getTime())}
          {" · "}Gen&nbsp;{ep.generation}, Lev&nbsp;{sig.aggression?.leverageCap ?? "—"}×, Kelly&nbsp;{((sig.aggression?.kellyFraction ?? 0) * 100).toFixed(0)}%
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. POSITIONS
   ═══════════════════════════════════════════════════════════════════════ */
function PositionsView({ sig }: { sig: any }) {
  const positions = sig.positions ?? [];
  return (
    <div className="space-y-4">
      <p className="text-xs text-inksoft leading-relaxed">
        Liquidation is computed on a smoothed mark price, with real fees + funding + slippage.
        The bar shows how close each position is to being wiped out.
      </p>

      {positions.length === 0 ? (
        <div className="card p-10 text-center">
          <Mascot size={80} mood="asleep" />
          <p className="text-sm text-inksoft mt-3">No open positions</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {positions.map((p: any, i: number) => <PosCard key={i} p={p} />)}
        </div>
      )}
    </div>
  );
}

function PosCard({ p }: { p: any }) {
  const mark  = p.mark ?? p.entry ?? 0;
  const liq   = p.liqPrice ?? 0;
  const entry = p.entry ?? 0;

  const distPct   = mark > 0 ? (Math.abs(mark - liq) / mark) * 100 : 100;
  const totalRng  = Math.abs(entry - liq) || 1;
  const remaining = cl(Math.abs(mark - liq) / totalRng, 0, 1) * 100;
  const level     = distPct < 4 ? "danger" : distPct < 12 ? "watch" : "safe";
  const liqClr    = level === "danger" ? "#e5566f" : level === "watch" ? "#e3c16f" : "#1f9d62";

  return (
    <div className="card p-4">
      {/* header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.side === "long" ? "bg-up/15 text-upink" : "bg-down/15 text-downink"}`}>
            {p.side}
          </span>
          <span className="font-bold text-ink text-sm">{sym(p.symbol)}</span>
          <span className="text-xs text-inksoft tnum">{p.leverage}×</span>
        </div>
        <span className="text-[10px] text-inksoft">{p.strategy_id}</span>
      </div>

      {/* PnL */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-lg font-bold tnum ${tone(p.uPnl)}`}>{signed(p.uPnl)}</span>
        <span className={`text-xs tnum ${tone(p.roiPct)}`}>{pct(p.roiPct)}</span>
      </div>

      {/* data grid */}
      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div><span className="text-[10px] text-inksoft block">Entry</span><span className="font-semibold tnum text-ink">{price(p.entry)}</span></div>
        <div><span className="text-[10px] text-inksoft block">Mark</span><span className="font-semibold tnum text-ink">{price(p.mark)}</span></div>
        <div><span className="text-[10px] text-inksoft block">Notional</span><span className="font-semibold tnum text-ink">{usd(p.notional, 0)}</span></div>
      </div>

      {/* liquidation runway */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-inksoft">Liq {price(liq)}</span>
          <span className="text-[10px] font-bold" style={{ color: liqClr }}>
            {level.toUpperCase()} · {distPct.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-cream2 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${remaining}%`, backgroundColor: liqClr }} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. EPISODES
   ═══════════════════════════════════════════════════════════════════════ */
function EpisodesView({ episodes, sig }: { episodes: any[]; sig: any }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-inksoft leading-relaxed">
        Each run goes until it hits the goal, runs out of time, or blows up, then resets and
        tries again, sharper.
      </p>

      {/* current ep */}
      <div className="card p-4 flex items-center gap-3">
        <span className="text-lg">⏳</span>
        <div>
          <p className="text-sm font-semibold text-ink">Episode {sig.episodeNum ?? 1} — in progress</p>
          <p className="text-xs text-inksoft">
            Equity {usd(sig.equity)} · {pct(sig.totalPnlPct)} · {sig.regime ?? "—"}
          </p>
        </div>
      </div>

      {/* bar timeline (≥ 3 episodes) */}
      {episodes.length >= 3 && (
        <div className="card-quiet p-4">
          <p className="text-[10px] uppercase tracking-wider text-inksoft mb-3">Run Timeline</p>
          <div className="flex items-end gap-1 h-20">
            {episodes.map((ep: any, i: number) => {
              const ret    = (ep.returnPct ?? 0) * 100;
              const absRet = Math.min(Math.abs(ret), 100);
              const h      = Math.max(8, (absRet / 100) * 64);
              const color  = ep.blownUp ? "#e5566f" : ret > 0 ? "#1f9d62" : "#e3c16f";
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="rounded-sm w-full max-w-8" style={{ height: h, backgroundColor: color, opacity: 0.85 }} />
                  {ep.blownUp && <span className="text-[9px]">💀</span>}
                  <span className="text-[8px] text-inksoft tnum">#{ep.episodeNum}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {episodes.length === 0 && (
        <div className="card-quiet p-6 text-center">
          <p className="text-sm text-inksoft">No finished runs yet — the first episode is still in progress.</p>
        </div>
      )}

      {/* finished list */}
      {episodes.length > 0 && (
        <div className="card p-4">
          <p className="text-[10px] uppercase tracking-widest text-inksoft mb-3">Finished Runs</p>
          <div className="space-y-2 overflow-x-auto">
            {[...episodes].reverse().map((ep: any, i: number) => {
              const ret = (ep.returnPct ?? 0) * 100;
              return (
                <div key={i} className="flex items-center justify-between text-xs gap-3 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-ink tnum shrink-0">#{ep.episodeNum}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      ep.blownUp ? "bg-down/15 text-downink" : ep.endReason === "goal" ? "bg-up/15 text-upink" : "bg-gold/15 text-gold"
                    }`}>{ep.endReason}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-inksoft">
                    <span>Peak {usd(ep.peakEquity)}</span>
                    <span>DD {pct((ep.maxDrawdownPct ?? 0) * 100)}</span>
                    <span className={`font-bold tnum ${tone(ret)}`}>{pct(ret)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. EVOLUTION
   ═══════════════════════════════════════════════════════════════════════ */
function EvolutionView({ generations }: { generations: any[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl text-ink">Evolution · Level-Ups</h2>
        <p className="text-xs text-inksoft mt-1 leading-relaxed">
          Every finished run banks a lesson and may promote or retire a strategy, retune Kelly,
          and unlock (or claw back) leverage.
        </p>
      </div>

      {generations.length === 0 ? (
        <div className="card p-10 text-center">
          <Mascot size={80} mood="asleep" />
          <p className="text-sm text-inksoft mt-3">No level-ups yet</p>
          <p className="text-xs text-inksoft/60 mt-1">Complete a run to trigger the first evolution.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {generations.map((g: any, i: number) => (
            <div key={i} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-ink">Gen {g.generation} after Run #{g.episodeNum}</p>
                <div className="flex items-center gap-3 text-xs text-inksoft tnum">
                  <span>Lev {g.leverageCap ?? "—"}×</span>
                  <span>Kelly {g.kellyFraction != null ? (g.kellyFraction * 100).toFixed(0) + "%" : "—"}</span>
                </div>
              </div>
              <p className="text-xs text-inksoft">{g.note ?? "—"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. STRATEGIES
   ═══════════════════════════════════════════════════════════════════════ */
function StrategiesView({ strategies }: { strategies: any[] }) {
  const allEarly = strategies.every((s: any) => s.status === "candidate" && (s.learned?.n ?? 0) < 5);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl text-ink">Strategy Book</h2>
        <p className="text-xs text-inksoft mt-1 leading-relaxed">
          A strategy only earns <em>active</em> after it proves a real edge (statistical gates +
          Deflated Sharpe). Losers get retired.
        </p>
      </div>

      {allEarly && (
        <div className="card-quiet p-4 flex items-center gap-2">
          <span className="text-lg">🔬</span>
          <p className="text-xs text-inksoft">
            All strategies are still in early evaluation — no promotions or retirements yet.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {strategies.map((s: any, i: number) => {
          const l = s.learned ?? {};
          return (
            <div key={i} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-ink">{s.name}</p>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor(s.status)}`}>
                  {s.status}
                </span>
              </div>
              <p className="text-xs text-inksoft mb-3">
                <span className="tnum">{l.n ?? 0}</span> trades · Kelly{" "}
                <span className="tnum">{l.kelly != null ? (l.kelly * 100).toFixed(0) + "%" : "—"}</span>
              </p>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="text-center">
                  <span className="text-[9px] text-inksoft block">Exp R</span>
                  <span className={`font-bold tnum ${tone(l.expectancy_R)}`}>
                    {l.expectancy_R != null ? l.expectancy_R.toFixed(3) : "—"}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[9px] text-inksoft block">PF</span>
                  <span className="font-bold tnum text-ink">
                    {l.profit_factor != null ? l.profit_factor.toFixed(2) : "—"}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[9px] text-inksoft block">DSR</span>
                  <span className="font-bold tnum text-ink">
                    {l.dsr != null ? l.dsr.toFixed(2) : "—"}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[9px] text-inksoft block">Conf</span>
                  <span className="font-bold tnum text-ink">
                    {l.confidence != null ? l.confidence.toFixed(2) : "—"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. WORLD
   ═══════════════════════════════════════════════════════════════════════ */
function WorldView({ sig }: { sig: any }) {
  const w         = sig.world ?? {};
  const macro     = w.macro ?? [];
  const headlines = w.headlines ?? [];
  const fed       = w.fed ?? [];
  const mood      = w.newsMood ?? {};

  return (
    <div className="space-y-4">
      {/* fear & greed */}
      <div className="grid sm:grid-cols-2 gap-3">
        <FnGGauge title="Crypto Fear & Greed" value={w.fearGreedCrypto?.value} label={w.fearGreedCrypto?.label ?? "unknown"} />
        <FnGGauge title="Stock Fear & Greed"  value={w.fearGreedStocks?.value} label={w.fearGreedStocks?.label ?? "unknown"} />
      </div>

      {/* macro & flow */}
      <div className="card p-5">
        <p className="text-[10px] uppercase tracking-widest text-inksoft mb-3">Macro &amp; Flow</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
          <Cell label="Regime"      value={w.regime ?? sig.regime ?? "—"} />
          <Cell label="Funding 8h"  value={`${w.fundingRate ?? 0}%`} tnum />
          <Cell label="Crypto OI"   value={w.oiUsd ?? "—"} tnum />
          <Cell label="Whales"      value={(w.whaleCrowd ?? "—").replace(/([a-z])([A-Z])/g, "$1 $2")} />
          <Cell label="News mood"   value={mood.mean_s?.toFixed(2) ?? "—"} tnum color={tone(mood.mean_s)} />
          <Cell label="Put/Call"    value={w.putCall ?? "—"} tnum />
        </div>
        {Array.isArray(macro) && macro.length > 0 && (
          <p className="text-xs text-inksoft mt-3 pt-2 border-t border-white/30">{macro.join(" · ")}</p>
        )}
      </div>

      {/* thesis */}
      {w.thesis && (
        <div className="card-quiet p-4 flex items-center gap-3">
          <span className="text-lg">🌸</span>
          <p className="text-sm text-ink font-medium">{w.thesis.replace(/[|_]/g, " ")}</p>
        </div>
      )}

      {/* headlines */}
      {(headlines.length > 0 || fed.length > 0) && (
        <div className="card p-5">
          <p className="text-[10px] uppercase tracking-widest text-inksoft mb-3">Headlines</p>
          <div className="space-y-1.5 text-xs text-inksoft max-h-48 overflow-y-auto pr-1">
            {fed.map((h: string, i: number) => <p key={`f${i}`} className="truncate">🏛️ {h}</p>)}
            {headlines.map((h: string, i: number) => <p key={`n${i}`} className="truncate">📰 {h}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, tnum: tn, color }: { label: string; value: string; tnum?: boolean; color?: string }) {
  return (
    <div>
      <span className="text-inksoft">{label}</span>
      <p className={`font-bold text-ink ${tn ? "tnum" : ""} ${color ?? ""}`}>{value}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. LESSONS
   ═══════════════════════════════════════════════════════════════════════ */
function LessonsView({ memory }: { memory: any[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl text-ink">Lessons Banked</h2>
        <p className="text-xs text-inksoft mt-1 leading-relaxed">
          The bot learns harder from blow-ups than wins. Each is tagged to a market regime.
        </p>
      </div>

      {memory.length === 0 ? (
        <div className="card p-10 text-center">
          <Mascot size={80} mood="asleep" />
          <p className="text-sm text-inksoft mt-3">No lessons banked yet</p>
          <p className="text-xs text-inksoft/60 mt-1">Lessons are written at the end of each run.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {memory.map((m: any, i: number) => {
            const kc = m.type === "blowup" ? "bg-down/15 text-downink"
                     : m.type === "win"    ? "bg-up/15 text-upink"
                     : "bg-gold/15 text-gold";
            return (
              <div key={i} className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${kc}`}>{m.type ?? "note"}</span>
                  {m.strategy_id && <span className="text-[10px] text-inksoft">{m.strategy_id}</span>}
                  {m.regime && <span className="text-[10px] text-lav">@ {m.regime}</span>}
                </div>
                <p className="text-xs text-ink">{m.note ?? m.corrective ?? "—"}</p>
                {m.importance != null && (
                  <p className="text-[10px] text-inksoft mt-1">Importance: {m.importance}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. TRADES
   ═══════════════════════════════════════════════════════════════════════ */
function TradesView({ trades, sig }: { trades: any[]; sig: any }) {
  const positions = sig.positions ?? [];

  /* combine opens (from current positions) + closes (from trades) */
  const openRows = positions.map((p: any) => ({
    type: "open" as const, ts: p.openedAt ?? sig.ts, symbol: p.symbol,
    side: p.side, leverage: p.leverage, reason: p.reason ?? p.setup_tag,
    amount: p.margin, pnl: null as number | null,
  }));
  const closeRows = trades.map((t: any) => ({
    type: "close" as const, ts: t.ts, symbol: t.symbol,
    side: t.side, leverage: t.leverage, reason: t.exit_reason,
    amount: null as number | null, pnl: t.pnl,
  }));
  const rows = [...openRows, ...closeRows].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl text-ink">Recent Fills</h2>

      {rows.length === 0 ? (
        <div className="card p-10 text-center"><p className="text-sm text-inksoft">No fills yet</p></div>
      ) : (
        <div className="card p-4">
          <div className="space-y-2 overflow-x-auto">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-xs min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    r.type === "open" ? "bg-lavsoft/30 text-lav" : "bg-cream2 text-inksoft"
                  }`}>{r.type}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    r.side === "long" ? "bg-up/15 text-upink" : "bg-down/15 text-downink"
                  }`}>{r.side?.toUpperCase()}</span>
                  <span className="font-semibold text-ink truncate">{sym(r.symbol)}</span>
                  <span className="text-inksoft tnum shrink-0">{r.leverage}×</span>
                  <span className="text-inksoft truncate hidden sm:inline">{r.reason}</span>
                </div>
                <span className={`font-semibold tnum shrink-0 ${r.type === "close" ? tone(r.pnl) : "text-ink"}`}>
                  {r.type === "close" ? signed(r.pnl) : usd(r.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
