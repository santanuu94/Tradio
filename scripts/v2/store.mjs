// scripts/v2/store.mjs - V2 data file paths and helpers
import { ROOT, DATA, readJSON, writeJSON, appendJSONL, readJSONL, ensureData, now, iso, log } from '../lib.mjs';

const V2_DATA = DATA;

// V2 data file paths
const V2_PATHS = {
  state: V2_DATA + '/state.v2.json',
  signals: process.env.FAB_SIGNALS ? process.env.FAB_SIGNALS : V2_DATA + '/signals.v2.json',
  episodes: V2_DATA + '/episodes.jsonl',
  generations: V2_DATA + '/generations.jsonl',
  strategies: V2_DATA + '/strategies.json',
  memory: V2_DATA + '/memory.jsonl',
  pending: V2_DATA + '/pending.v2.json',
  backtestStats: V2_DATA + '/backtest_stats.json',
  trades: V2_DATA + '/trades.v2.jsonl',
  equity: V2_DATA + '/equity.v2.jsonl',
  prices: V2_DATA + '/prices.v2.json',
  log: V2_DATA + '/engine.v2.log',
  journal: V2_DATA + '/journal.v2.jsonl',
  playbook: V2_DATA + '/playbook.json',
  reflog: V2_DATA + '/reflog.v2.jsonl',
  calib: V2_DATA + '/calibration.json',
  world: V2_DATA + '/world.v2.json',
  worldThesis: V2_DATA + '/world_thesis.v2.json',
  worldCache: V2_DATA + '/world_cache_v2',
};

import fs from 'node:fs';

// Ensure world cache folder exists
ensureData();
const wc = V2_PATHS.worldCache;
if (!fs.existsSync(wc)) {
  fs.mkdirSync(wc, { recursive: true });
}

// Re-export lib helpers
export { ROOT, DATA, readJSON, writeJSON, appendJSONL, readJSONL, ensureData, now, iso, log } from '../lib.mjs';

// Export V2 paths
export const V2 = V2_PATHS;

// Helper: round to d decimals
export function round(x, d = 2) {
  const m = Math.pow(10, d);
  return Math.round(x * m) / m;
}

// Helper: clamp value
export function clamp(x, lo, hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
