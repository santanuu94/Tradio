// scripts/v2/perp.mjs - Leverage and liquidation math (pure functions)

// Side multiplier
export const sideSign = (side) => (side === "short" ? -1 : 1);

// Initial margin requirement
export const imr = (leverage) => 1 / leverage;

// Find tier for notional amount
export function tierFor(notional, tiers) {
  const n = Math.abs(notional);
  let t = tiers[0];
  for (const cand of tiers) {
    if (n >= cand.floor && n < cand.cap) {
      t = cand;
      break;
    }
    t = cand;
  }
  return t;
}

// Maintenance margin
export function maintenanceMargin(notional, tier) {
  return Math.abs(notional) * tier.mmr - (tier.deduction || 0);
}

// Max leverage at notional
export function maxLeverageAt(notional, tiers) {
  return tierFor(notional, tiers).maxLev;
}

// Liquidation price
export function liqPrice(side, entry, leverage, mmr) {
  const s = sideSign(side);
  return entry * (1 - s * (1 / leverage) + s * mmr);
}

// Bankruptcy price
export function bankruptcyPrice(side, entry, leverage) {
  const s = sideSign(side);
  return entry * (1 - s * (1 / leverage));
}

// Unrealized PnL
export function unrealizedPnl(side, entry, mark, qty) {
  return (mark - entry) * qty * sideSign(side);
}

// Position equity
export function positionEquity(isolatedMargin, uPnl) {
  return isolatedMargin + uPnl;
}

// Check if liquidated
export function isLiquidated(side, mark, lqPrice) {
  return side === "short" ? mark >= lqPrice : mark <= lqPrice;
}

// Size from margin
export function sizeFromMargin(margin, leverage, entryPrice) {
  const notional = margin * leverage;
  return { notional, qty: notional / entryPrice };
}

// Margin for notional
export function marginForNotional(notional, leverage) {
  return Math.abs(notional) / leverage;
}

// EMA update
export function emaUpdate(prev, price, alpha) {
  if (prev == null || !isFinite(prev)) return price;
  return alpha * price + (1 - alpha) * prev;
}

// Trade fee
export function tradeFee(notional, rate) {
  return Math.abs(notional) * rate;
}

// Funding payment
export function fundingPayment(notional, rate, side) {
  return -sideSign(side) * Math.abs(notional) * rate;
}

// Crossed funding timestamps
export function crossedFundingTimestamps(lastTs, nowTs, fundingHoursUTC = [0, 8, 16]) {
  if (!lastTs || nowTs <= lastTs) return [];
  const out = [];
  const start = new Date(lastTs);
  start.setUTCMinutes(0, 0, 0);
  for (let t = start.getTime(); t <= nowTs; t += 3600 * 1000) {
    if (t <= lastTs) continue;
    const h = new Date(t).getUTCHours();
    if (fundingHoursUTC.includes(h)) out.push(t);
  }
  return out;
}

// Slippage fraction
export function slippageFraction(orderNotionalUsd, volFrac = 0.02, depthProxyUsd = 2000000, k = 0.6) {
  const ratio = Math.max(0, orderNotionalUsd) / Math.max(1, depthProxyUsd);
  return k * Math.max(0.0005, volFrac) * Math.sqrt(ratio);
}

// Fill price
export function fillPrice(refPrice, side, halfSpreadFrac, slipFrac) {
  const s = sideSign(side);
  return refPrice * (1 + s * (halfSpreadFrac + slipFrac));
}

// Open position builder
export function openPosition({ symbol, market, side, entryMark, margin, leverage, tiers, meta }) {
  const { notional, qty } = sizeFromMargin(margin, leverage, entryMark);
  const tier = tierFor(notional, tiers);
  const mmr = tier.mmr;
  const maintDeduction = tier.deduction || 0;

  return {
    symbol,
    market,
    side,
    entryPrice: entryMark,
    qty,
    notional,
    isolatedMargin: margin,
    leverage,
    mmr,
    maintDeduction,
    liqPrice: liqPrice(side, entryMark, leverage, mmr),
    bankruptcyPrice: bankruptcyPrice(side, entryMark, leverage),
    fundingAccrued: 0,
    feesPaid: 0,
    realizedPnl: 0,
    peakUPnl: 0,
    openedAt: Date.now(),
    lastFundingTs: Date.now(),
    openMeta: meta
  };
}

// Mark position (update with current mark price)
export function markPosition(pos, mark) {
  const uPnl = unrealizedPnl(pos.side, pos.entryPrice, mark, pos.qty);
  const equity = positionEquity(pos.isolatedMargin, uPnl);
  const maintMargin = maintenanceMargin(pos.notional, { mmr: pos.mmr, deduction: pos.maintDeduction });
  const liquidated = isLiquidated(pos.side, mark, pos.liqPrice);

  return { mark, uPnl, equity, maintMargin, liquidated };
}
