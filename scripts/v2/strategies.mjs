// scripts/v2/strategies.mjs - Strategy library (deterministic, no AI)
import { V2, readJSON, writeJSON, now, clamp } from './store.mjs';
import { rsi, sma } from '../lib.mjs';

// =============================================================================
// SEED STRATEGIES
// =============================================================================
const SEED_STRATEGIES = [
  {
    id: "tsmom",
    name: "Time-series momentum",
    setup_tag: "momentum",
    markets: ["crypto", "us", "india"],
    text: "Long when the 28-day trend is up (price > 200-SMA); short when down. Fast-resolving version for active trading.",
    status: "candidate",
    baseLev: 12,
    stopPct: 0.05,
    targetPct: 0.10
  },
  {
    id: "donchian",
    name: "Donchian breakout",
    setup_tag: "breakout",
    markets: ["crypto", "us", "india"],
    text: "Long a 20-day high breakout above the 200-SMA; short the 20-day breakdown below it. Turtle-style trend following.",
    status: "candidate",
    baseLev: 12,
    stopPct: 0.05,
    targetPct: 0.08
  },
  {
    id: "rsi2dip",
    name: "RSI-2 dip (Connors)",
    setup_tag: "mean-reversion",
    markets: ["crypto", "us", "india"],
    text: "Buy 2-day oversold ONLY in an uptrend (RSI2<10 & price>200-SMA); short overbought in a downtrend.",
    status: "candidate",
    baseLev: 10,
    stopPct: 0.05,
    targetPct: 0.06
  },
  {
    id: "mom_trend",
    name: "Momentum + trend",
    setup_tag: "trend",
    markets: ["crypto", "us", "india"],
    text: "Long strong 28-day momentum above the 200-SMA; ride the trailing exit.",
    status: "candidate",
    baseLev: 10,
    stopPct: 0.05,
    targetPct: 0.08
  },
  {
    id: "orb",
    name: "Opening-range breakout",
    setup_tag: "orb",
    markets: ["us"],
    text: "Trade the break of the first 30m session range at the US open (live-only).",
    status: "candidate",
    baseLev: 5,
    stopPct: 0.016,
    targetPct: 0.028
  },
  {
    id: "ibreakout",
    name: "Intraday breakout (discovered)",
    setup_tag: "breakout-15m",
    markets: ["crypto"],
    text: "15-minute breakout of the prior ~12h range (48 bars). Tight 1.5% stop, 8% target. Forward-test only.",
    status: "candidate",
    baseLev: 15,
    stopPct: 0.015,
    targetPct: 0.08,
    intraday: true
  }
];

// =============================================================================
// STRATEGY MANAGEMENT
// =============================================================================
function ensureStrategies() {
  let strategies = readJSON(V2.strategies);

  if (!strategies || !strategies.length) {
    // Seed with initial strategies
    strategies = SEED_STRATEGIES.map(s => ({
      ...s,
      learned: {
        n: 0,
        expectancy_R: 0,
        win_rate: 0,
        kelly: 0.12,
        confidence: 0.2
      }
    }));
    writeJSON(V2.strategies, strategies);
    return strategies;
  }

  // Register any NEW seed strategies without clobbering learned stats
  const existingIds = new Set(strategies.map(s => s.id));
  for (const seed of SEED_STRATEGIES) {
    if (!existingIds.has(seed.id)) {
      strategies.push({
        ...seed,
        learned: {
          n: 0,
          expectancy_R: 0,
          win_rate: 0,
          kelly: 0.12,
          confidence: 0.2
        }
      });
    }
  }

  writeJSON(V2.strategies, strategies);
  return strategies;
}

// =============================================================================
// SIGNAL FUNCTIONS (deterministic rules)
// =============================================================================

// Helper: return over N periods
function retN(c, n) {
  const len = c.length;
  if (len < n + 1) return 0;
  return (c[len - 1] / c[len - 1 - n]) - 1;
}

// Helper: highest of prior n bars (excluding latest)
function highestPrior(c, n) {
  if (c.length < n + 1) return null;
  let h = -Infinity;
  for (let i = c.length - n - 1; i < c.length - 1; i++) {
    if (c[i] > h) h = c[i];
  }
  return h;
}

// Helper: lowest of prior n bars (excluding latest)
function lowestPrior(c, n) {
  if (c.length < n + 1) return null;
  let l = Infinity;
  for (let i = c.length - n - 1; i < c.length - 1; i++) {
    if (c[i] < l) l = c[i];
  }
  return l;
}

// sigTsmom: Time-series momentum
function sigTsmom(q, strategy) {
  const c = q.closes;
  if (!c || c.length < 30) return null;

  const r28 = retN(c, 28);
  const s200 = sma(c, 200);
  const price = c[c.length - 1];

  // Long: positive momentum + above SMA (or no SMA)
  if (r28 > 0.03) {
    if (!s200 || price > s200) {
      return {
        side: "long",
        baseLev: strategy.baseLev,
        stopPct: strategy.stopPct,
        targetPct: strategy.targetPct,
        confidence: 0.62,
        reason: `tsmom: r28=${(r28*100).toFixed(1)}%`
      };
    }
  }

  // Short: negative momentum + below SMA
  if (r28 < -0.03) {
    if (!s200 || price < s200) {
      return {
        side: "short",
        baseLev: strategy.baseLev,
        stopPct: strategy.stopPct,
        targetPct: strategy.targetPct,
        confidence: 0.55,
        reason: `tsmom: r28=${(r28*100).toFixed(1)}%`
      };
    }
  }

  return null;
}

// sigDonchian: Donchian breakout
function sigDonchian(q, strategy) {
  const c = q.closes;
  if (!c || c.length < 25) return null;

  const hi = highestPrior(c, 20);
  const lo = lowestPrior(c, 20);
  const s200 = sma(c, 200);
  const price = c[c.length - 1];

  if (hi === null || lo === null) return null;

  // Long: breakout above 20-day high + above SMA
  if (price > hi) {
    if (!s200 || price > s200) {
      return {
        side: "long",
        baseLev: strategy.baseLev,
        stopPct: strategy.stopPct,
        targetPct: strategy.targetPct,
        confidence: 0.60,
        reason: `donchian: price ${price.toFixed(2)} > hi ${hi.toFixed(2)}`
      };
    }
  }

  // Short: breakdown below 20-day low + below SMA
  if (price < lo) {
    if (!s200 || price < s200) {
      return {
        side: "short",
        baseLev: strategy.baseLev,
        stopPct: strategy.stopPct,
        targetPct: strategy.targetPct,
        confidence: 0.55,
        reason: `donchian: price ${price.toFixed(2)} < lo ${lo.toFixed(2)}`
      };
    }
  }

  return null;
}

// sigRsi2dip: RSI-2 dip buying
function sigRsi2dip(q, strategy) {
  const c = q.closes;
  if (!c || c.length < 210) return null;

  const r2 = rsi(c, 2);
  const s200 = sma(c, 200);
  const price = c[c.length - 1];

  // Long: RSI2 < 10 + above 200-SMA
  if (r2 < 10) {
    if (s200 && price > s200) {
      return {
        side: "long",
        baseLev: strategy.baseLev,
        stopPct: strategy.stopPct,
        targetPct: strategy.targetPct,
        confidence: 0.60,
        reason: `rsi2dip: r2=${r2.toFixed(1)} oversold`
      };
    }
  }

  // Short: RSI2 > 90 + below 200-SMA
  if (r2 > 90) {
    if (s200 && price < s200) {
      return {
        side: "short",
        baseLev: strategy.baseLev,
        stopPct: strategy.stopPct,
        targetPct: strategy.targetPct,
        confidence: 0.55,
        reason: `rsi2dip: r2=${r2.toFixed(1)} overbought`
      };
    }
  }

  return null;
}

// sigMomTrend: Momentum + trend
function sigMomTrend(q, strategy) {
  const c = q.closes;
  if (!c || c.length < 30) return null;

  const s200 = sma(c, 200);
  const r28 = retN(c, 28);
  const price = c[c.length - 1];

  // Need uptrend + strong momentum + moderate RSI
  const inUptrend = !s200 || price > s200;
  const strongMom = r28 > 0.05;
  const hasMom = q.mom && q.mom > 1;
  const rsiOk = !q.rsi || q.rsi < 78;

  if (inUptrend && strongMom && hasMom && rsiOk) {
    return {
      side: "long",
      baseLev: strategy.baseLev,
      stopPct: strategy.stopPct,
      targetPct: strategy.targetPct,
      confidence: 0.55,
      reason: `mom_trend: r28=${(r28*100).toFixed(1)}%`
    };
  }

  return null;
}

// sigOrb: Opening range breakout (US only)
function sigOrb(q, strategy) {
  // US only - check if we have session data
  if (!q.orHi || !q.orLo || !q.sessionStart) return null;

  const price = q.price;
  const nowTs = now();

  // Must be after the range forms (at least 30 min after session start)
  const sessionAgeMs = nowTs - q.sessionStart;
  if (sessionAgeMs < 30 * 60 * 1000) return null;

  // Long: price breaks above opening range
  if (price > q.orHi) {
    return {
      side: "long",
      baseLev: strategy.baseLev,
      stopPct: strategy.stopPct,
      targetPct: strategy.targetPct,
      confidence: 0.55,
      reason: `orb: breakout above ${q.orHi.toFixed(2)}`
    };
  }

  // Short: price breaks below opening range
  if (price < q.orLo) {
    return {
      side: "short",
      baseLev: strategy.baseLev,
      stopPct: strategy.stopPct,
      targetPct: strategy.targetPct,
      confidence: 0.50,
      reason: `orb: breakdown below ${q.orLo.toFixed(2)}`
    };
  }

  return null;
}

// sigBreakoutIntraday: 15-minute breakout (crypto only)
function sigBreakoutIntraday(q, strategy) {
  const ci = q.closesIntraday;
  if (!ci || ci.length < 50) return null;

  const n = 48;
  const channelHi = highestPrior(ci, n);
  const channelLo = lowestPrior(ci, n);
  const price = ci[ci.length - 1];

  if (channelHi === null || channelLo === null) return null;

  // Long: breakout above channel
  if (price > channelHi) {
    return {
      side: "long",
      baseLev: strategy.baseLev,
      stopPct: strategy.stopPct,
      targetPct: strategy.targetPct,
      confidence: 0.50,
      reason: `ibreakout: 15m breakout above ${channelHi.toFixed(2)}`
    };
  }

  // Short: breakdown below channel
  if (price < channelLo) {
    return {
      side: "short",
      baseLev: strategy.baseLev,
      stopPct: strategy.stopPct,
      targetPct: strategy.targetPct,
      confidence: 0.50,
      reason: `ibreakout: 15m breakdown below ${channelLo.toFixed(2)}`
    };
  }

  return null;
}

// Map strategy IDs to signal functions
const SIGNAL_FUNCTIONS = {
  tsmom: sigTsmom,
  donchian: sigDonchian,
  rsi2dip: sigRsi2dip,
  mom_trend: sigMomTrend,
  orb: sigOrb,
  ibreakout: sigBreakoutIntraday
};

// =============================================================================
// EXIT LOGIC
// =============================================================================
function strategyExit(pos, q, regime) {
  const c = q.closes;
  if (!c || c.length < 10) return null;

  const price = c[c.length - 1];
  const r2 = rsi(c, 2);
  const r28 = retN(c, 28);
  const s200 = sma(c, 200);

  // rsi2dip exits: RSI2 crosses back (long exits at r2>=65, short at r2<=35)
  if (pos.strategy_id === "rsi2dip") {
    if (pos.side === "long" && r2 >= 65) {
      return { reason: "rsi2dip_exit: r2 crossed up", exitSide: "long" };
    }
    if (pos.side === "short" && r2 <= 35) {
      return { reason: "rsi2dip_exit: r2 crossed down", exitSide: "short" };
    }
  }

  // donchian exits: 10-day channel break against position
  if (pos.strategy_id === "donchian") {
    const hi10 = highestPrior(c, 10);
    const lo10 = lowestPrior(c, 10);
    if (pos.side === "long" && price < lo10) {
      return { reason: "donchian_exit: broke 10-day low", exitSide: "long" };
    }
    if (pos.side === "short" && price > hi10) {
      return { reason: "donchian_exit: broke 10-day high", exitSide: "short" };
    }
  }

  // tsmom and mom_trend exits: 28-day return flips sign
  if (pos.strategy_id === "tsmom" || pos.strategy_id === "mom_trend") {
    if (pos.side === "long" && r28 < -0.01) {
      return { reason: "tsmom_exit: momentum flipped negative", exitSide: "long" };
    }
    if (pos.side === "short" && r28 > 0.01) {
      return { reason: "tsmom_exit: momentum flipped positive", exitSide: "short" };
    }
  }

  // Stop loss and take profit based on entry price
  const entry = pos.entryPrice;
  if (pos.side === "long") {
    const stopPx = entry * (1 - pos.stopPct);
    const targetPx = entry * (1 + pos.targetPct);
    if (price <= stopPx) {
      return { reason: `stop_hit: ${((price/entry-1)*100).toFixed(2)}%`, exitSide: "long" };
    }
    if (price >= targetPx) {
      return { reason: `target_hit: ${((price/entry-1)*100).toFixed(2)}%`, exitSide: "long" };
    }
  } else { // short
    const stopPx = entry * (1 + pos.stopPct);
    const targetPx = entry * (1 - pos.targetPct);
    if (price >= stopPx) {
      return { reason: `stop_hit: ${((price/entry-1)*100).toFixed(2)}%`, exitSide: "short" };
    }
    if (price <= targetPx) {
      return { reason: `target_hit: ${((price/entry-1)*100).toFixed(2)}%`, exitSide: "short" };
    }
  }

  return null;
}

// =============================================================================
// MAIN DISPATCHER
// =============================================================================
function runStrategies(state, eq, cfg, histCache) {
  const pendingOrders = [];
  const nowTs = now();
  const maxPositions = cfg.v2?.strategies?.maxConcurrentPositions || 10;

  // =======================================================================
  // STEP 1: Check exits on every open position
  // =======================================================================
  for (const [symbol, pos] of Object.entries(state.positions)) {
    const q = histCache[symbol];
    if (!q || !q.closes || q.closes.length < 10) continue;

    const exitSignal = strategyExit(pos, q, state.regime);
    if (exitSignal) {
      pendingOrders.push({
        op: "close",
        symbol,
        side: pos.side, // close the existing side
        reason: exitSignal.reason,
        trade_id: pos.trade_id
      });
    }
  }

  // =======================================================================
  // STEP 2: Look for entries
  // =======================================================================
  const openPositionsCount = Object.keys(state.positions).length;
  if (openPositionsCount >= maxPositions) {
    return pendingOrders; // Max positions reached
  }

  // Get watchlist from config
  const watchlist = cfg.watchlist || [];

  // Load strategies
  const strategies = ensureStrategies();

  for (const item of watchlist) {
    const symbol = item.symbol;
    const market = item.market;

    // Skip if we already have a position
    if (state.positions[symbol]) continue;

    // Check re-entry cooldown (2 minutes)
    const lastTrade = state.lastTradeAt?.[symbol];
    if (lastTrade && (nowTs - lastTrade) < 2 * 60 * 1000) continue;

    // Check market is enabled
    const levCfg = cfg.v2?.leverage?.[market];
    if (!levCfg || !levCfg.enabled) continue;

    // Get quote data
    const q = histCache[symbol];
    if (!q || !q.closes || q.closes.length < 10) continue;

    // Skip if data is stale (> 5 min old)
    if (q.fetchedAt && (nowTs - q.fetchedAt) > 5 * 60 * 1000) continue;

    // Find all strategies that trade this market
    const eligibleStrategies = strategies.filter(
      s => s.status !== "retired" && s.markets.includes(market)
    );

    let bestSignal = null;
    let bestScore = -1;

    for (const strat of eligibleStrategies) {
      const sigFn = SIGNAL_FUNCTIONS[strat.id];
      if (!sigFn) continue;

      const signal = sigFn(q, strat);
      if (!signal) continue;

      // Score: confidence * (0.5 + strategy confidence)
      const stratConf = strat.learned?.confidence || 0.2;
      const score = signal.confidence * (0.5 + stratConf);

      if (score > bestScore) {
        bestScore = score;
        bestSignal = { ...signal, strategy_id: strat.id, setup_tag: strat.setup_tag };
      }
    }

    if (bestSignal) {
      // Queue open order
      const leverage = clamp(bestSignal.baseLev, 1, state.aggression.leverageCap);

      pendingOrders.push({
        op: "open",
        symbol,
        side: bestSignal.side,
        leverage,
        strategy_id: bestSignal.strategy_id,
        setup_tag: bestSignal.setup_tag,
        stopPct: bestSignal.stopPct,
        targetPct: bestSignal.targetPct,
        confidence: bestSignal.confidence,
        reason: bestSignal.reason,
        trade_id: `t_${nowTs}_${symbol}`,
        sizePct: null // sizing resolved later
      });

      // Set cooldown
      if (!state.lastTradeAt) state.lastTradeAt = {};
      state.lastTradeAt[symbol] = nowTs;
    }
  }

  return pendingOrders;
}

// =============================================================================
// EXPORTS
// =============================================================================
export {
  SEED_STRATEGIES,
  ensureStrategies,
  runStrategies,
  strategyExit,
  sigTsmom,
  sigDonchian,
  sigRsi2dip,
  sigMomTrend,
  sigOrb,
  sigBreakoutIntraday
};
