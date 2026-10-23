// scripts/v2/engine.mjs - FabInvests Trading Engine
import { V2, readJSON, writeJSON, readJSONL, appendJSONL, now, round, clamp, ensureData } from './store.mjs';
import { loadConfig, fetchQuote, fetchFx, fetchHistory, indicators, regime as computeRegime, iso, log } from '../lib.mjs';
import * as P from './perp.mjs';
import { freshV2State, recordEquityPeak, episodeEndReason, finalizeEpisode, nextEpisode, setGoal } from './episode.mjs';
import { runStrategies } from './strategies.mjs';
import { sizeOrder } from './sizing.mjs';
import { onEpisodeEnd, onClose, buildBrainV2, scoreStrategies, evolveTick, IMPORTANCE } from './brain.mjs';
import { collectWorldV2 } from './world.mjs';

// =============================================================================
// CONSTANTS
// =============================================================================
const HISTORY_REFRESH_MS = 20 * 60 * 1000; // 20 minutes
const INTRADAY_REFRESH_MS = 10 * 60 * 1000; // 10 minutes

// =============================================================================
// MAIN LOOP
// =============================================================================
export async function runCycle(cfg, state, once = false) {
  const startTs = now();
  console.log(`\n=== CYCLE ${state.cycles + 1} ===`);

  // ===========================================================================
  // STEP 1: FETCH DATA
  // ===========================================================================
  console.log('Fetching data...');

  // Get FX rate
  const fxRate = await fetchFx();
  state.fxRate = fxRate;

  // Get watchlist symbols
  const watchlist = cfg.watchlist || [];
  const indexSymbols = cfg.indices?.map(i => i.symbol) || [];
  const allSymbols = [...new Set([...watchlist.map(w => w.symbol), ...indexSymbols])];

  // Fetch quotes in parallel
  const quotePromises = allSymbols.map(async (symbol) => {
    try {
      const q = await fetchQuote(symbol);
      return { symbol, quote: q, error: null };
    } catch (e) {
      return { symbol, quote: null, error: e.message };
    }
  });

  const quoteResults = await Promise.all(quotePromises);

  // Build price map with stale handling
  const prices = {};
  for (const { symbol, quote, error } of quoteResults) {
    if (quote?.ok) {
      prices[symbol] = { ...quote, fetchedAt: startTs, stale: false };
    } else {
      // Keep last good value, mark stale
      const existing = state.prices?.[symbol];
      if (existing) {
        prices[symbol] = { ...existing, stale: true, fetchError: error };
      }
    }
  }

  // Refresh history if needed
  const historyAge = startTs - (state.historyRefreshAt || 0);
  const intradayAge = startTs - (state.intradayRefreshAt || 0);

  const histCache = state.histCache || {};

  if (historyAge > HISTORY_REFRESH_MS) {
    console.log('Refreshing daily history...');
    for (const symbol of allSymbols) {
      try {
        const closes = await fetchHistory(symbol, '1y', '1d');
        if (closes.length > 0) {
          histCache[symbol] = histCache[symbol] || {};
          histCache[symbol].closes = closes;
          histCache[symbol].closesFetchedAt = startTs;
        }
      } catch (e) {
        // Keep existing if fetch fails
      }
    }
    state.historyRefreshAt = startTs;
  }

  // Refresh intraday for crypto
  if (intradayAge > INTRADAY_REFRESH_MS) {
    console.log('Refreshing intraday crypto...');
    const cryptoSymbols = watchlist.filter(w => w.market === 'crypto').map(w => w.symbol);
    for (const symbol of cryptoSymbols) {
      try {
        const closes15m = await fetchHistory(symbol, '5d', '15m');
        if (closes15m.length > 0) {
          histCache[symbol] = histCache[symbol] || {};
          histCache[symbol].closesIntraday = closes15m;
          histCache[symbol].closesIntradayFetchedAt = startTs;
        }
      } catch (e) {
        // Keep existing
      }
    }
    state.intradayRefreshAt = startTs;
  }

  // Enrich quotes with indicators
  for (const symbol of allSymbols) {
    const h = histCache[symbol];
    if (h?.closes && h.closes.length > 10) {
      const ind = indicators(h.closes);
      histCache[symbol] = { ...h, ...ind };
      // Add current price
      if (prices[symbol]?.price) {
        histCache[symbol].price = prices[symbol].price;
      }
    }
  }

  // ===========================================================================
  // STEP 2: COMPUTE REGIME
  // ===========================================================================
  const regimeQuotes = {};
  for (const sym of ['BTC-USD', '^GSPC', '^NSEI']) {
    if (histCache[sym]?.closes) {
      regimeQuotes[sym] = histCache[sym].closes;
    }
  }

  const riskState = {
    ddCaution: state.maxDrawdownPct > (cfg.risk?.ddCaution || 0.12),
    ddHalt: state.maxDrawdownPct > (cfg.risk?.ddHalt || 0.20)
  };

  const regimeLabel = await computeRegime(regimeQuotes, riskState);
  state.regime = regimeLabel;

  // ===========================================================================
  // STEP 3: MARK AND MANAGE POSITIONS
  // ===========================================================================
  console.log('Managing positions...');

  const markAlpha = cfg.v2?.markEmaAlpha || 0.25;
  const maxHoldHours = cfg.v2?.aggression?.maxHoldHours || 4;

  for (const [symbol, pos] of Object.entries(state.positions)) {
    const quote = prices[symbol];
    if (!quote?.price) continue;

    const mark = quote.price;

    // Update EMA mark
    const prevMark = pos.markEma || pos.entryPrice;
    pos.markEma = P.emaUpdate(prevMark, mark, markAlpha);

    // Use mark EMA for calculations
    const calcMark = pos.markEma;

    // Accrue funding for crypto
    if (pos.market === 'crypto' && cfg.v2?.fundingHoursUTC) {
      const fundingTs = P.crossedFundingTimestamps(pos.lastFundingTs, startTs, cfg.v2.fundingHoursUTC);
      if (fundingTs.length > 0) {
        const fundingRate = state.fundingRate || 0;
        for (const ts of fundingTs) {
          const payment = P.fundingPayment(pos.notional, fundingRate, pos.side);
          pos.fundingAccrued = (pos.fundingAccrued || 0) + payment;
          pos.lastFundingTs = ts;
        }
      }
    }

    // Mark position
    const marked = P.markPosition(pos, calcMark);

    // Check exits in strict order
    let exitReason = null;

    // 1. Liquidation
    if (marked.liquidated) {
      exitReason = 'liquidation';
    }

    // 2. Stop-loss
    if (!exitReason) {
      const entry = pos.entryPrice;
      const stopPx = pos.side === 'long'
        ? entry * (1 - pos.stopPct)
        : entry * (1 + pos.stopPct);

      if (pos.side === 'long' && calcMark <= stopPx) {
        exitReason = 'stop-loss';
      } else if (pos.side === 'short' && calcMark >= stopPx) {
        exitReason = 'stop-loss';
      }
    }

    // 3. Take-profit
    if (!exitReason) {
      const entry = pos.entryPrice;
      const targetPx = pos.side === 'long'
        ? entry * (1 + pos.targetPct)
        : entry * (1 - pos.targetPct);

      if (pos.side === 'long' && calcMark >= targetPx) {
        exitReason = 'take-profit';
      } else if (pos.side === 'short' && calcMark <= targetPx) {
        exitReason = 'take-profit';
      }
    }

    // 4. Time-stop
    if (!exitReason) {
      const holdHours = (startTs - pos.openedAt) / (1000 * 60 * 60);
      if (holdHours >= maxHoldHours) {
        exitReason = 'time-stop';
      }
    }

    // 5. Trailing exit
    if (!exitReason && pos.targetPct) {
      // Track peak profit
      if (marked.uPnl > (pos.peakUPnl || 0)) {
        pos.peakUPnl = marked.uPnl;
      }

      // Activate trailing after trailActivateRoi
      const activateRoi = cfg.v2?.aggression?.trailActivateRoi || 0.5;
      const givebackRoi = cfg.v2?.aggression?.trailGiveRoi || 0.25;

      const entry = pos.entryPrice;
      const entryNotional = Math.abs(pos.notional);
      const currentRoi = marked.uPnl / entryNotional;

      if (currentRoi >= activateRoi && pos.peakUPnl) {
        const trailThreshold = pos.peakUPnl * (1 - givebackRoi);
        if (marked.uPnl <= trailThreshold) {
          exitReason = 'trailing-stop';
        }
      }
    }

    // Execute exit if needed
    if (exitReason) {
      await closePosition(state, pos, calcMark, exitReason, cfg);
      delete state.positions[symbol];
    } else {
      // Update position with current mark
      pos.mark = calcMark;
      pos.uPnl = marked.uPnl;
      pos.equity = marked.equity;
    }
  }

  // ===========================================================================
  // STEP 4: RECOMPUTE EQUITY
  // ===========================================================================
  let totalUnrealized = 0;
  let totalNotional = 0;

  for (const [symbol, pos] of Object.entries(state.positions)) {
    totalUnrealized += pos.uPnl || 0;
    totalNotional += Math.abs(pos.notional || 0);
  }

  state.equity = state.walletBalance + totalUnrealized;
  state.investedNotional = totalNotional;
  state.grossLeverage = state.equity > 0 ? totalNotional / state.equity : 0;

  // ===========================================================================
  // STEP 5: PROCESS PENDING ORDERS
  // ===========================================================================
  const pending = readJSON(V2.pending) || [];

  for (const order of pending) {
    if (order.op === 'open') {
      await openPosition(state, order, prices, histCache, cfg);
    } else if (order.op === 'close') {
      const pos = state.positions[order.symbol];
      if (pos) {
        const quote = prices[order.symbol];
        if (quote?.price) {
          await closePosition(state, pos, quote.price, order.reason || 'strategy-exit', cfg);
          delete state.positions[order.symbol];
        }
      }
    }
  }

  // Clear pending
  writeJSON(V2.pending, []);

  // ===========================================================================
  // STEP 6: RUN STRATEGIES
  // ===========================================================================
  console.log('Running strategies...');

  const signals = runStrategies(state, histCache, cfg, histCache);

  // Size and execute orders
  for (const signal of signals) {
    if (signal.op === 'open' && !state.positions[signal.symbol]) {
      const sized = sizeOrder(state, signal, histCache, cfg);
      await openPosition(state, sized, prices, histCache, cfg);
    } else if (signal.op === 'close') {
      const pos = state.positions[signal.symbol];
      if (pos) {
        const quote = prices[signal.symbol];
        if (quote?.price) {
          await closePosition(state, pos, quote.price, signal.reason, cfg);
          delete state.positions[signal.symbol];
        }
      }
    }
  }

  // ===========================================================================
  // STEP 7: CHECK EPISODE END
  // ===========================================================================
  const endReason = episodeEndReason(state, cfg, startTs);

  if (endReason) {
    console.log(`Episode ending: ${endReason}`);

    // Close survivors
    for (const [symbol, pos] of Object.entries(state.positions)) {
      const quote = prices[symbol];
      if (quote?.price) {
        await closePosition(state, pos, quote.price, 'episode-end', cfg);
      }
    }
    state.positions = {};

    // Finalize episode
    const rec = finalizeEpisode(state, endReason);

    // Run post-mortem
    onEpisodeEnd(state, rec, cfg);

    // Start next episode
    nextEpisode(state, cfg);
    writeJSON(V2.state, state);
  } else {
    // Rescore if any trades closed this cycle
    if (state.tradesClosedThisCycle) {
      scoreStrategies();
    }

    // Evolve on brain loop cadence
    const brainLoopMs = (cfg.v2?.strategies?.brainLoopMinutes || 8) * 60 * 1000;
    const brainAge = startTs - (state.lastBrainTick || 0);
    if (brainAge > brainLoopMs) {
      evolveTick(state, cfg);
      state.lastBrainTick = startTs;
    }
  }

  // ===========================================================================
  // STEP 8: COLLECT WORLD
  // ===========================================================================
  console.log('Collecting world...');
  const world = await collectWorldV2(state);

  // ===========================================================================
  // STEP 9: PERSIST AND PUBLISH
  // ===========================================================================
  state.prices = prices;
  state.histCache = histCache;
  state.cycles += 1;
  state.updatedAt = startTs;

  writeJSON(V2.state, state);
  writeJSON(V2.prices, prices);

  // Equity row
  appendJSONL(V2.equity, {
    ts: startTs,
    equity: round(state.equity, 2),
    walletBalance: round(state.walletBalance, 2),
    unrealized: round(totalUnrealized, 2),
    notional: round(totalNotional, 2)
  });

  // Publish signals
  publishSignals(state, cfg, prices, world);

  const elapsed = ((now() - startTs) / 1000).toFixed(1);
  console.log(`Cycle complete in ${elapsed}s`);
  console.log(`Equity: $${state.equity.toFixed(2)} | Wallet: $${state.walletBalance.toFixed(2)}`);
  console.log(`Positions: ${Object.keys(state.positions).length} | Regime: ${state.regime}`);

  return state;
}

// =============================================================================
// POSITION MANAGEMENT
// =============================================================================
async function openPosition(state, order, prices, histCache, cfg) {
  const symbol = order.symbol;
  const quote = prices[symbol];
  if (!quote?.price) return;

  const market = (cfg.watchlist.find(w => w.symbol === symbol) || {}).market || 'crypto';
  const tierList = cfg.v2?.maintenanceTiers?.[market] || [{ floor: 0, cap: 1e12, maxLev: 1, mmr: 0.01, deduction: 0 }];

  const entryMark = quote.price;

  // Calculate fees
  const tiers = tierList;
  const pos = P.openPosition({
    symbol,
    market,
    side: order.side,
    entryMark,
    margin: order.marginUsd,
    leverage: order.leverage,
    tiers,
    meta: {
      strategy_id: order.strategy_id,
      setup_tag: order.setup_tag,
      stopPct: order.stopPct,
      targetPct: order.targetPct,
      reason: order.reason
    }
  });

  // Pay fees
  const takerFee = (cfg.v2?.perpFees?.taker || 0.0005) * pos.notional;
  const feeNotional = pos.notional * cfg.v2?.perpFees?.taker || 0.0005;
  pos.feesPaid = takerFee;

  // Deduct from wallet
  const totalCost = pos.isolatedMargin + takerFee;
  if (totalCost > state.walletBalance) {
    console.log(`Insufficient wallet for ${symbol}: need $${totalCost.toFixed(2)}, have $${state.walletBalance.toFixed(2)}`);
    return;
  }

  state.walletBalance -= totalCost;

  // Write pre journal
  appendJSONL(V2.journal, {
    ts: now(),
    type: 'pre',
    trade_id: order.trade_id,
    symbol,
    market,
    side: order.side,
    strategy_id: order.strategy_id,
    setup_tag: order.setup_tag,
    regime: state.regime,
    entry_price: entryMark,
    leverage: order.leverage,
    margin: pos.isolatedMargin,
    notional: pos.notional,
    stopPct: order.stopPct,
    targetPct: order.targetPct
  });

  // Add to positions
  state.positions[symbol] = pos;

  // Track trade timestamp
  if (!state.lastTradeAt) state.lastTradeAt = {};
  state.lastTradeAt[symbol] = now();

  state.tradesClosedThisCycle = false;

  console.log(`Opened ${order.side} ${symbol} @ ${entryMark.toFixed(2)}, lev ${order.leverage}x, margin $${pos.isolatedMargin.toFixed(2)}`);
}

async function closePosition(state, pos, exitPrice, reason, cfg) {
  const { symbol, side, entryPrice, notional, isolatedMargin, qty, market } = pos;

  // Calculate fees and slippage
  const slippageFrac = P.slippageFraction(notional);
  const halfSpread = cfg.v2?.perpFees?.taker || 0.0005;
  const fillPx = P.fillPrice(exitPrice, side, halfSpread, slippageFrac);

  const exitNotional = Math.abs(fillPx * qty);
  const exitFee = exitNotional * (cfg.v2?.perpFees?.taker || 0.0005);

  // Realized PnL
  const sideMult = side === 'short' ? -1 : 1;
  const rawPnl = (fillPx - entryPrice) * qty * sideMult;
  const netPnl = rawPnl - exitFee - (pos.feesPaid || 0);

  // Add funding accrued
  const netPnlWithFunding = netPnl + (pos.fundingAccrued || 0);

  // Realized R
  const realizedR = isolatedMargin !== 0 ? netPnlWithFunding / isolatedMargin : 0;

  // Update wallet
  state.walletBalance += isolatedMargin + netPnlWithFunding;

  // Write post journal
  appendJSONL(V2.journal, {
    ts: now(),
    type: 'post',
    trade_id: pos.trade_id || `t_${pos.openedAt}_${symbol}`,
    symbol,
    market,
    side,
    exit_price: fillPx,
    exit_reason: reason,
    net_pnl: round(netPnlWithFunding, 2),
    realized_R: round(realizedR, 4),
    roi_on_margin: round(netPnlWithFunding / isolatedMargin, 4),
    hold_secs: Math.round((now() - pos.openedAt) / 1000)
  });

  // Append to trades
  appendJSONL(V2.trades, {
    ts: now(),
    trade_id: pos.trade_id,
    symbol,
    market,
    side,
    strategy_id: pos.openMeta?.strategy_id,
    setup_tag: pos.openMeta?.setup_tag,
    entry: entryPrice,
    exit: fillPx,
    margin: isolatedMargin,
    notional,
    leverage: pos.leverage,
    pnl: round(netPnlWithFunding, 2),
    realized_R: round(realizedR, 4),
    duration_secs: Math.round((now() - pos.openedAt) / 1000),
    exit_reason: reason
  });

  // Call onClose for brain
  onClose(state, pos, reason);

  state.tradesClosedThisCycle = true;

  console.log(`Closed ${symbol} @ ${fillPx.toFixed(2)}, PnL: $${netPnlWithFunding.toFixed(2)} (${(realizedR * 100).toFixed(1)}R), reason: ${reason}`);
}

// =============================================================================
// PUBLISH SIGNALS
// =============================================================================
function publishSignals(state, cfg, prices, world) {
  const positions = [];

  for (const [symbol, pos] of Object.entries(state.positions)) {
    const info = cfg.watchlist?.find(w => w.symbol === symbol) || {};
    const quote = prices[symbol] || {};

    positions.push({
      symbol,
      name: info.name || symbol,
      market: pos.market,
      side: pos.side,
      leverage: pos.leverage,
      notional: round(pos.notional, 2),
      margin: round(pos.isolatedMargin, 2),
      entry: round(pos.entryPrice, 2),
      mark: round(pos.mark || pos.entryPrice, 2),
      liqPrice: round(pos.liqPrice, 2),
      uPnl: round(pos.uPnl || 0, 2),
      roiPct: round(((pos.uPnl || 0) / pos.isolatedMargin) * 100, 2),
      fundingAccrued: round(pos.fundingAccrued || 0, 2),
      setup_tag: pos.openMeta?.setup_tag,
      strategy_id: pos.openMeta?.strategy_id,
      stopPct: pos.openMeta?.stopPct,
      targetPct: pos.openMeta?.targetPct,
      reason: pos.openMeta?.reason
    });
  }

  const recentEpisodes = readJSONL(V2.episodes, 10).reverse();

  const brain = buildBrainV2(state, state.regime);

  const signal = {
    ts: now(),
    iso: iso(),
    version: 2,
    episodeNum: state.episodeNum,
    equity: round(state.equity, 2),
    walletBalance: round(state.walletBalance, 2),
    startingCapital: state.startingCapital,
    goal: state.goal,
    totalPnl: round(state.equity - state.startingCapital, 2),
    totalPnlPct: round((state.equity - state.startingCapital) / state.startingCapital * 100, 2),
    progressPct: state.goal.target > state.goal.startEquity
      ? round((state.equity - state.goal.startEquity) / (state.goal.target - state.goal.startEquity) * 100, 1)
      : 0,
    goalGap: round(state.goal.target - state.equity, 2),
    realizedPnlEpisode: round(state.realizedPnlEpisode, 2),
    peakEquity: round(state.peakEquity, 2),
    maxDrawdownPct: round(state.maxDrawdownPct * 100, 2),
    riskState: state.riskState,
    regime: state.regime,
    generation: state.generation,
    aggression: state.aggression,
    lifetime: state.lifetime,
    fundingRate: state.fundingRate || 0,
    investedNotional: round(state.investedNotional || 0, 2),
    grossLeverage: round(state.grossLeverage || 0, 2),
    positions,
    watch: cfg.watchlist || [],
    recentEpisodes,
    brain,
    world
  };

  writeJSON(V2.signals, signal);
  return signal;
}

// =============================================================================
// MAIN ENTRY
// =============================================================================
async function main() {
  const once = process.argv.includes('--once');

  console.log('FabInvests Engine v2');
  console.log('====================');

  // Load config and state
  const cfg = loadConfig();
  if (!cfg) {
    console.error('No config.json found');
    process.exit(1);
  }

  let state = readJSON(V2.state);

  if (!state) {
    console.log('No state found. Run: node scripts/v2/init.mjs');
    process.exit(1);
  }

  // Ensure data directory
  ensureData();

  // Run cycle
  await runCycle(cfg, state, once);

  if (!once) {
    // Daemon loop
    const intervalMs = (cfg.v2?.strategies?.loopSeconds || 30) * 1000;
    console.log(`\nDaemon mode: next cycle in ${intervalMs / 1000}s`);

    setInterval(async () => {
      try {
        const currentState = readJSON(V2.state);
        if (currentState) {
          await runCycle(cfg, currentState, false);
        }
      } catch (e) {
        console.error('Cycle error:', e.message);
      }
    }, intervalMs);
  }
}

// Run if called directly
import { fileURLToPath } from 'node:url';
import path from 'node:path';
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
  });
}

export { main };
