// scripts/world/score.mjs - Pure scoring functions
import { mean, stdev } from '../lib.mjs';

// =============================================================================
// SENTIMENT LEXICON
// =============================================================================
const POSITIVE = {
  surge: 1.8, rally: 1.6, jump: 1.5, gain: 1.3, beat: 1.5,
  upgrade: 1.7, bullish: 2.0, record: 1.8, growth: 1.5,
  breakout: 1.6, adoption: 1.4, approval: 1.5, inflows: 1.3,
  rebound: 1.4, soar: 2.0, climb: 1.3, rise: 1.2, win: 1.5,
  profit: 1.4, outperform: 1.6, buy: 1.3, bullish: 2.0,
  optimism: 1.7, bullishness: 1.8, highs: 1.4,领先: 1.5,
  上涨: 1.3, 看涨: 1.8, 突破: 1.5
};

const NEGATIVE = {
  crash: -2.5, plunge: -2.3, plummet: -2.4, slump: -1.8,
  miss: -1.5, downgrade: -1.7, bearish: -2.0, selloff: -1.8,
  hack: -1.6, fraud: -2.0, scam: -2.2, liquidation: -2.0,
  recession: -2.0, bankruptcy: -2.3, panic: -2.2, drop: -1.4,
  fall: -1.3, loss: -1.5, decline: -1.4, crash: -2.5,
  plunge: -2.3, tumble: -2.0, sink: -1.7, worst: -1.8,
  warning: -1.3, fear: -1.5, worry: -1.3, concern: -1.2,
  暴跌: -2.5, 下跌: -1.5, 崩盘: -2.5, 跌破: -1.8
};

const NEGATORS = new Set(['not', 'no', 'never', 'without', 'despite', 'lacking', 'absence']);

// =============================================================================
// LEXICON SCORE
// =============================================================================
export function lexiconScore(text) {
  if (!text || typeof text !== 'string') return 0;

  const cleaned = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ');
  let sum = 0;
  let hit = false;
  let prevNegated = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[^a-z]/g, '');

    // Check for negator
    if (NEGATORS.has(w)) {
      prevNegated = true;
      continue;
    }

    let weight = 0;
    if (POSITIVE[w]) {
      weight = POSITIVE[w];
    } else if (NEGATIVE[w]) {
      weight = NEGATIVE[w];
    }

    if (weight !== 0) {
      hit = true;
      // Flip positive weight to negative if negated
      if (prevNegated && weight > 0) {
        weight = -weight * 0.7;
      }
      sum += weight;
      prevNegated = false;
    } else {
      prevNegated = false;
    }
  }

  if (!hit) return 0;

  // Normalize to -1..1 by dividing by 3
  return clamp(sum / 3, -1, 1);
}

function clamp(x, lo, hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

// =============================================================================
// FEAR AND GREED BANDS
// =============================================================================
export function fngBand(v) {
  if (v == null || isNaN(v)) return "unknown";
  if (v <= 24) return "extreme_fear";
  if (v <= 44) return "fear";
  if (v <= 55) return "neutral";
  if (v <= 74) return "greed";
  return "extreme_greed";
}

// =============================================================================
// REGIME SCORE FROM MACRO
// =============================================================================
export function regimeScore(m) {
  // m: { TNX: { price, changePct }, VIX: { price, changePct }, DXY: { price, changePct }, oil: { price, changePct }, gold: { price, changePct } }

  let score = 0;
  const drivers = [];

  // Dollar: higher = more risk-off (defensive)
  if (m.DXY?.price) {
    const dxy = m.DXY.price;
    // DXY around 100 is neutral, above = risk-off
    const dxyScore = (dxy - 100) / 20; // each 20 points = 1 point of risk-off
    score -= dxyScore * 0.3;
    if (dxy > 105) drivers.push('strong_dollar');
    else if (dxy < 95) drivers.push('weak_dollar');
  }

  // Yields (TNX): higher = more risk-off (inflation fear)
  if (m.TNX?.price) {
    const tnx = m.TNX.price;
    // 4% is neutral, above = risk-off
    const tnxScore = (tnx - 4) / 2;
    score -= tnxScore * 0.25;
    if (tnx > 5) drivers.push('high_yields');
    else if (tnx < 3) drivers.push('low_yields');
  }

  // VIX: higher = risk-off, very low = complacence
  if (m.VIX?.price) {
    const vix = m.VIX.price;
    // 20 is neutral
    if (vix > 25) {
      score -= 0.5;
      drivers.push('high_vol');
    } else if (vix < 14) {
      score += 0.3;
      drivers.push('low_vol');
    }
  }

  // Gold: higher = risk-off
  if (m.gold?.changePct != null) {
    if (m.gold.changePct > 1) {
      score += 0.2;
      drivers.push('gold_rally');
    }
  }

  // Oil: crash = risk-off
  if (m.oil?.changePct != null) {
    if (m.oil.changePct < -3) {
      score -= 0.3;
      drivers.push('oil_crash');
    } else if (m.oil.changePct > 3) {
      score += 0.2;
      drivers.push('oil_rally');
    }
  }

  // Clamp score
  score = clamp(score, -1, 1);

  // Determine label
  let label = "neutral";
  if (score < -0.3) label = "risk_off";
  else if (score > 0.3) label = "risk_on";

  // Posture
  let posture = "normal";
  if (score < -0.6) posture = "defensive";
  else if (score < -0.3) posture = "cautious";
  else if (score > 0.5) posture = "aggressive";

  return { label, score: round(score, 2), posture, drivers };
}

function round(x, d = 2) {
  const m = Math.pow(10, d);
  return Math.round(x * m) / m;
}

// =============================================================================
// AGGREGATE NEWS
// =============================================================================
export function aggregateNews(items) {
  if (!items || !items.length) {
    return { mean_s: 0, dispersion: 0, volume: 0, impact: 0, n: 0, top: [], mixed: false };
  }

  const scores = [];
  for (const item of items) {
    if (item.title) {
      scores.push(lexiconScore(item.title));
    }
  }

  const n = scores.length;
  if (n === 0) {
    return { mean_s: 0, dispersion: 0, volume: n, impact: 0, n: 0, top: [], mixed: false };
  }

  const mean_s = mean(scores);
  const dispersion = stdev(scores);
  const volume = n;

  // Impact: weighted by absolute score
  const impact = mean_s * Math.sqrt(volume);

  // Top 3 most impactful titles
  const scoredItems = items.map((item, i) => ({
    title: item.title,
    score: scores[i] || 0
  })).sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 3);

  // Mixed: high dispersion means disagreement
  const mixed = dispersion > 0.45;

  return {
    mean_s: round(mean_s, 3),
    dispersion: round(dispersion, 3),
    volume,
    impact: round(impact, 3),
    n,
    top: scoredItems,
    mixed
  };
}
