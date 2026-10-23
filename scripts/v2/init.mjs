// scripts/v2/init.mjs - Initialize FabInvests engine
import { V2, readJSON, writeJSON, ensureData } from './store.mjs';
import { loadConfig, now } from '../lib.mjs';
import { freshV2State } from './episode.mjs';
import { ensureStrategies } from './strategies.mjs';

// Parse --force flag
const force = process.argv.includes('--force');

// Load config
const cfg = loadConfig();

if (!cfg) {
  console.error('Error: config.json not found');
  process.exit(1);
}

ensureData();
ensureStrategies();

// Check existing state
const existing = readJSON(V2.state);

if (existing && !force) {
  console.log('=== FabInvests Status ===');
  console.log(`Episode: ${existing.episodeNum}`);
  console.log(`Generation: ${existing.generation}`);
  console.log(`Equity: $${existing.equity.toFixed(2)}`);
  console.log(`Starting Capital: $${existing.startingCapital}`);
  console.log(`Wallet: $${existing.walletBalance.toFixed(2)}`);
  console.log(`Peak Equity: $${existing.peakEquity.toFixed(2)}`);
  console.log(`Kelly: ${(existing.aggression.kellyFraction * 100).toFixed(1)}%`);
  console.log(`Leverage Cap: ${existing.aggression.leverageCap}x`);
  console.log(`Goal: $${existing.goal.target} by ${existing.goal.deadlineHours}h`);
  console.log(`Risk State: ${existing.riskState}`);
  console.log('========================');
  console.log('Use --force to start fresh');
  process.exit(0);
}

// Fresh start
const state = freshV2State(cfg);

// Write state
writeJSON(V2.state, state);

// Write empty pending
writeJSON(V2.pending, []);

console.log('=== FabInvests Started ===');
console.log(`Episode 1 launched`);
console.log(`Starting capital: $${state.startingCapital}`);
console.log(`Leverage start: ${cfg.v2.aggression.leverageStart}x`);
console.log(`Leverage ceiling: ${cfg.v2.aggression.leverageCeiling}x`);
console.log(`Kelly fraction: ${(cfg.v2.aggression.kellyFractionStart * 100).toFixed(1)}%`);
console.log(`Goal: $${state.goal.target} in ${state.goal.deadlineHours}h`);
console.log('===========================');
