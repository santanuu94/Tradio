// scripts/v2/brain.mjs - Evolution brain (zero AI, deterministic learning)
import { V2, readJSON, writeJSON, readJSONL, appendJSONL, now, round, clamp } from './store.mjs';
import { expectancyStats, profitFactor, mean, stdev, sha256 } from '../lib.mjs';

// =============================================================================
// 1. IMPORTANCE MAP - how hard the bot learns from each exit
// =============================================================================
export const IMPORTANCE = {
  "liquidation": 10,
  "capital-floor": 10,
  "stop-loss": 7,
  "episode-end": 6,
  "take-profit": 5,
  "trailing-stop": 4,
  "trend-flip": 3,
  "rsi2-reverted": 3,
  "manual-close": 3,
  "strategy-exit": 3,
  "default": 2
};

// =============================================================================
// 2. STATISTICAL HELPERS
// =============================================================================
function normCdf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function erf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Acklam's inverse normal approximation
  const a = [-3.969683028665376e+01, 2.209460984245205e+02,
             -2.759285104469687e+02, 1.383577518672690e+02,
             -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02,
             -1.556989798598866e+02, 6.680131188771972e+01,
             -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01,
             -2.400758277161838e+00, -2.549732539343734e+00,
             4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01,
             2.445134137142996e+00, 3.754408661907416e+00];

  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

function skewness(arr) {
  if (arr.length < 3) return 0;
  const m = mean(arr);
  const s = stdev(arr);
  if (s === 0) return 0;
  const n = arr.length;
  const cubed = arr.reduce((a, b) => a + Math.pow(b - m, 3), 0);
  return cubed / ((n - 1) * n * Math.pow(s, 3));
}

function kurtosis(arr) {
  if (arr.length < 4) return 0;
  const m = mean(arr);
  const s = stdev(arr);
  if (s === 0) return 0;
  const n = arr.length;
  const fourth = arr.reduce((a, b) => a + Math.pow(b - m, 4), 0);
  return (fourth * n) / ((n - 1) * (n - 2) * Math.pow(s, 4)) - 3;
}

// =============================================================================
// DEFLATED SHARPE RATIO
// =============================================================================
export function deflatedSharpe(rs, nTrials) {
  const n = rs.length;
  if (n < 8) return { sr: 0, dsr: 0, sr0: 0, pass: false };

  const sd = stdev(rs);
  if (sd === 0) return { sr: 0, dsr: 0, sr0: 0, pass: false };

  const sr = mean(rs) / sd;
  const N = Math.max(2, nTrials || 2);

  // Expected maximum Sharpe ratio
  const gamma = 0.5772156649;
  const emax = (1 - gamma) * normInv(1 - 1 / N) + gamma * normInv(1 - 1 / (N * Math.E));

  // Variance of Sharpe estimator
  const varSR = 1 / (n - 1);
  const sr0 = Math.sqrt(varSR) * emax;

  // Skewness and kurtosis adjustment
  const sk = skewness(rs);
  const ku = kurtosis(rs);

  const denom = Math.sqrt(Math.max(1e-6, 1 - sk * sr + ((ku - 1) / 4) * sr * sr));
  const dsr = normCdf(((sr - sr0) * Math.sqrt(n - 1)) / denom);

  return { sr: round(sr, 3), dsr: round(dsr, 3), sr0: round(sr0, 3), pass: dsr > 0.95 };
}

// =============================================================================
// 3. STRATEGY KELLY CALCULATION
// =============================================================================
export function strategyKelly(s, rs) {
  const n = rs.length;

  // Under 5 trades: use default
  if (n < 5) {
    const baseKelly = s.backtest_kelly != null ? 0.04 : 0.12;
    return clamp(baseKelly, 0.02, 0.40);
  }

  const stats = expectancyStats(rs);
  const variance = stats.avgLossR !== 0 ? Math.abs(stats.avgWinR / stats.avgLossR) : 0;

  // Half-Kelly from realized edge
  let kelly = 0.4 * clamp(stats.expectancyR / (variance || 1), 0, 1.5);

  // Blend with backtest prior (pseudo-count of 15)
  if (s.backtest_kelly != null) {
    const pseudoN = 15;
    const blend = n / (n + pseudoN);
    kelly = kelly * blend + s.backtest_kelly * (1 - blend);
  }

  // Halve on probation
  if (s.status === "probation") {
    kelly *= 0.5;
  }

  // Drop to 0.02 if retired
  if (s.status === "retired") {
    kelly = 0.02;
  }

  return clamp(kelly, 0.02, 0.40);
}

// =============================================================================
// 4. LOAD CLOSED TRADES
// =============================================================================
export function loadClosedV2(sinceTs = 0) {
  const entries = readJSONL(V2.journal, 6000);
  const pre = new Map();
  const closed = [];

  for (const e of entries) {
    if (e.ts < sinceTs) continue;

    if (e.type === "pre" && e.trade_id) {
      pre.set(e.trade_id, e);
    } else if (e.type === "post" && e.trade_id) {
      const p = pre.get(e.trade_id);
      if (p) {
        const holdMs = e.ts - p.ts;
        closed.push({
          trade_id: e.trade_id,
          symbol: p.symbol,
          market: p.market,
          strategy_id: p.strategy_id,
          setup_tag: p.setup_tag,
          regime: p.regime,
          side: p.side,
          entry_price: p.entry_price,
          exit_price: e.exit_price,
          exit_reason: e.exit_reason,
          net_pnl: e.net_pnl,
          realized_R: e.realized_R,
          roi_on_margin: e.roi_on_margin,
          ts_close: e.ts,
          hold_secs: Math.round(holdMs / 1000)
        });
      }
    }
  }

  return closed;
}

// =============================================================================
// 5. SCORE STRATEGIES
// =============================================================================
export function scoreStrategies() {
  const strategies = readJSON(V2.strategies) || [];
  const nTrials = strategies.length;

  // Load all closed trades
  const closed = loadClosedV2(0);
  const byStrategy = {};

  for (const t of closed) {
    if (!byStrategy[t.strategy_id]) byStrategy[t.strategy_id] = [];
    byStrategy[t.strategy_id].push(t.realized_R);
  }

  let changed = false;

  for (const s of strategies) {
    const rs = byStrategy[s.id] || [];
    const stats = expectancyStats(rs);
    const dsr = deflatedSharpe(rs, nTrials);

    // Update learned stats
    s.learned = s.learned || {};
    s.learned.n = rs.length;
    s.learned.expectancy_R = stats.expectancyR;
    s.learned.win_rate = stats.winRate;
    s.learned.sqn = stats.sqn;
    s.learned.profit_factor = stats.profitFactor;
    s.learned.wilson_lb = stats.wilsonLb;

    // Lifecycle gates
    const tNeed = 3.0 + 0.25 * (nTrials - 1);

    // Candidate -> Active
    if (s.status === "candidate") {
      if (rs.length >= 30 &&
          stats.wilsonLb > stats.breakevenWr &&
          stats.profitFactor >= 1.5 &&
          stats.sqn >= 1.5 &&
          stats.expectancyR > 0 &&
          stats.tStat > tNeed &&
          dsr.pass) {
        s.status = "active";
        s.learned.confidence = 0.6;
        changed = true;
        // Hash-chain to reflog
        appendJSONL(V2.reflog, {
          ts: now(),
          type: "lifecycle",
          strategy_id: s.id,
          from: "candidate",
          to: "active",
          reason: "thresholds_met",
          trade_count: rs.length
        });
      }
    }

    // Active -> Probation
    if (s.status === "active") {
      const recent = rs.slice(-30);
      const recentStats = expectancyStats(recent);
      if (recentStats.profitFactor < 1.2 || recentStats.expectancyR < 0 || recentStats.sqn < 1.0) {
        s.status = "probation";
        s.learned.confidence = 0.25;
        changed = true;
        appendJSONL(V2.reflog, {
          ts: now(),
          type: "lifecycle",
          strategy_id: s.id,
          from: "active",
          to: "probation",
          reason: "recent_degradation",
          recent_pf: recentStats.profitFactor,
          recent_exp: recentStats.expectancyR
        });
      }
    }

    // Probation -> Active or Retired
    if (s.status === "probation") {
      const recent = rs.slice(-30);
      const recentStats = expectancyStats(recent);
      if (recentStats.profitFactor >= 1.5 && recentStats.expectancyR > 0) {
        s.status = "active";
        s.learned.confidence = 0.5;
        changed = true;
        appendJSONL(V2.reflog, {
          ts: now(),
          type: "lifecycle",
          strategy_id: s.id,
          from: "probation",
          to: "active",
          reason: "recovered"
        });
      } else if (rs.length >= 50) {
        s.status = "retired";
        s.learned.confidence = 0.1;
        changed = true;
        appendJSONL(V2.reflog, {
          ts: now(),
          type: "lifecycle",
          strategy_id: s.id,
          from: "probation",
          to: "retired",
          reason: "persistent_failure"
        });
      }
    }

    // Set confidence and kelly
    if (s.status === "candidate") {
      s.learned.confidence = 0.2;
    }
    s.learned.kelly = strategyKelly(s, rs);
  }

  if (changed) {
    writeJSON(V2.strategies, strategies);
  }

  return strategies;
}

// =============================================================================
// 6. REASONINGBANK MEMORY
// =============================================================================
export function addMemory(memory) {
  const entry = {
    ts: now(),
    ...memory
  };
  appendJSONL(V2.memory, entry);
}

export function distillEpisodeLessons(state, rec, closedThisEp) {
  if (!closedThisEp || closedThisEp.length === 0) {
    addMemory({
      type: "note",
      importance: 1,
      regime: state.regime,
      note: "No trades fired this episode - consider broadening gates"
    });
    return;
  }

  // Group by strategy and regime
  const byGroup = {};
  for (const t of closedThisEp) {
    const key = `${t.strategy_id}:${t.regime}`;
    if (!byGroup[key]) byGroup[key] = [];
    byGroup[key].push(t);
  }

  // Find worst (blowup)
  let worst = null, worstPnl = Infinity;
  // Find worst loss
  let worstLoss = null, worstLossR = -Infinity;
  // Find best win
  let bestWin = null, bestWinR = -Infinity;

  for (const [key, trades] of Object.entries(byGroup)) {
    const avgR = mean(trades.map(t => t.realized_R));
    if (avgR < worstPnl) {
      worstPnl = avgR;
      worst = { key, trades, avgR };
    }
    if (avgR < worstLossR) {
      worstLossR = avgR;
      worstLoss = { key, trades, avgR };
    }
    if (avgR > bestWinR) {
      bestWinR = avgR;
      bestWin = { key, trades, avgR };
    }
  }

  // Blowup lesson
  if (worst && worstPnl < -0.5) {
    const [stratId, regime] = worst.key.split(":");
    addMemory({
      type: "blowup",
      importance: 10,
      strategy_id: stratId,
      regime,
      avgR: worst.avgR,
      n: worst.trades.length,
      corrective: `Avoid ${stratId} in ${regime} regime - avg R: ${worst.avgR.toFixed(2)}`
    });
  }

  // Loss lesson
  if (worstLoss && worstLossR < 0) {
    const [stratId, regime] = worstLoss.key.split(":");
    addMemory({
      type: "loss",
      importance: 7,
      strategy_id: stratId,
      regime,
      avgR: worstLoss.avgR,
      n: worstLoss.trades.length,
      note: `${stratId} losing in ${regime} - reduce exposure`
    });
  }

  // Win lesson
  if (bestWin && bestWinR > 0.1) {
    const [stratId, regime] = bestWin.key.split(":");
    addMemory({
      type: "win",
      importance: 5,
      strategy_id: stratId,
      regime,
      avgR: bestWin.avgR,
      n: bestWin.trades.length,
      note: `${stratId} winning in ${regime} - consider adding exposure`
    });
  }
}

export function retrieveLessons(regimeStr, k = 4) {
  const entries = readJSONL(V2.memory, 500);
  const nowTs = now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const scored = [];

  for (const m of entries) {
    const ageDays = (nowTs - m.ts) / DAY_MS;
    const recency = Math.pow(0.95, ageDays);
    const relevance = m.regime === regimeStr ? 1.0 : 0.4;
    const imp = IMPORTANCE[m.importance] || IMPORTANCE.default;

    const score = imp * recency * relevance;
    scored.push({ ...m, _score: score });
  }

  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, k).map(m => {
    const { _score, ...rest } = m;
    return rest;
  });
}

// =============================================================================
// 7. EPISODE END PROCESSING
// =============================================================================
export function onEpisodeEnd(state, rec, cfg) {
  // Score strategies
  const strategies = scoreStrategies();

  // Get closed trades this episode
  const closed = loadClosedV2(state.startedAt);
  const closedThisEp = closed.filter(t => t.ts_close >= state.startedAt);

  // Distill lessons
  distillEpisodeLessons(state, rec, closedThisEp);

  // Measure edge
  const rs = closedThisEp.map(t => t.realized_R);
  const edge = rs.length >= 4 ? mean(rs) : 0;

  const V = cfg.v2;

  // Adjust unlockedLevel and kellyFraction based on performance
  const survivedWell = rec.endReason === "goal" || (rec.endReason === "time" && state.equity > state.startingCapital);

  if (survivedWell && edge > 0) {
    state.aggression.unlockedLevel += 1;
    state.aggression.kellyFraction += 0.07 * clamp(edge, 0.2, 1.2);
  } else if (rec.endReason === "blowup") {
    state.aggression.unlockedLevel = Math.max(0, state.aggression.unlockedLevel - 1);
    state.aggression.kellyFraction = Math.max(0.05, state.aggression.kellyFraction - 0.03);
  }

  // Recompute leverage cap
  const levStart = V.aggression.leverageStart;
  const levCeil = V.aggression.leverageCeiling;
  const step = V.aggression.earnItUnlockStep;
  state.aggression.leverageCap = clamp(
    levStart + state.aggression.unlockedLevel * step,
    levStart,
    levCeil
  );

  // Bump generation
  state.generation += 1;

  // Snapshot generation
  const note = survivedWell
    ? `Episode ${state.episodeNum} completed: goal hit or profitable, edge=${edge.toFixed(3)}`
    : `Episode ${state.episodeNum} ended: ${rec.endReason}, edge=${edge.toFixed(3)}`;

  appendJSONL(V2.generations, {
    ts: now(),
    generation: state.generation,
    episodeNum: state.episodeNum,
    startEquity: state.startingCapital,
    endEquity: state.equity,
    returnPct: (state.equity - state.startingCapital) / state.startingCapital,
    edge,
    unlockedLevel: state.aggression.unlockedLevel,
    kellyFraction: state.aggression.kellyFraction,
    note
  });

  // Reflog
  appendJSONL(V2.reflog, {
    ts: now(),
    type: "episode_end",
    generation: state.generation,
    episode: state.episodeNum,
    endReason: rec.endReason,
    edge,
    unlockedLevel: state.aggression.unlockedLevel,
    kellyFraction: state.aggression.kellyFraction
  });

  return { strategies, edge };
}

// =============================================================================
// 8. EVOLUTION TICK (live cadence between runs)
// =============================================================================
export function evolveTick(state, cfg) {
  const closed = loadClosedV2(0);
  if (closed.length < 4) return;

  // Last 25 realized R
  const recentR = closed.slice(-25).map(t => t.realized_R);
  const edge = mean(recentR);

  const V = cfg.v2;
  const levStart = V.aggression.leverageStart;
  const levCeil = V.aggression.leverageCeiling;
  const step = V.aggression.earnItUnlockStep;

  // Calculate current drawdown
  const drawdown = state.peakEquity > 0
    ? (state.peakEquity - state.equity) / state.peakEquity
    : 0;

  let changed = false;

  // Raise level if doing well
  if (edge > 0.05 && state.equity > state.startingCapital && drawdown < 0.15) {
    state.aggression.unlockedLevel += 1;
    state.aggression.kellyFraction += 0.02;
    changed = true;
  }
  // Lower level if doing poorly
  else if (edge < -0.05 || drawdown >= 0.18) {
    state.aggression.unlockedLevel = Math.max(0, state.aggression.unlockedLevel - 1);
    state.aggression.kellyFraction = Math.max(0.05, state.aggression.kellyFraction - 0.015);
    changed = true;
  }

  if (changed) {
    state.aggression.kellyFraction = clamp(state.aggression.kellyFraction, 0.05, 0.40);
    state.aggression.leverageCap = clamp(
      levStart + state.aggression.unlockedLevel * step,
      levStart,
      levCeil
    );

    appendJSONL(V2.reflog, {
      ts: now(),
      type: "evolve_tick",
      edge,
      drawdown,
      unlockedLevel: state.aggression.unlockedLevel,
      kellyFraction: state.aggression.kellyFraction,
      leverageCap: state.aggression.leverageCap
    });
  }

  return changed;
}

// =============================================================================
// 9. BRAIN DIGEST & UTILITIES
// =============================================================================
export function buildBrainV2(state, regimeStr) {
  const strategies = readJSON(V2.strategies) || [];
  const generations = readJSONL(V2.generations, 20);
  const lessons = retrieveLessons(regimeStr, 4);

  const active = strategies.filter(s => s.status === "active");
  const avoid = strategies.filter(s => s.status === "retired").map(s => s.id);

  return {
    generation: state.generation,
    episode: state.episodeNum,
    regime: regimeStr,
    aggression: { ...state.aggression },
    importance: state.importanceAccum,
    lifetime: { ...state.lifetime },
    strategies,
    activeCount: active.length,
    avoidList: avoid,
    lessons,
    recentGenerations: generations
  };
}

export function onClose(state, pos, reasonTag) {
  const importance = IMPORTANCE[reasonTag] || IMPORTANCE.default;
  state.importanceAccum += importance;
}

export function collectWorldV2() {
  return readJSON(V2.world) || null;
}
