// scripts/lib.mjs - Shared toolbox: real price data + math helpers
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = path.dirname(__filename);
const ROOT = path.dirname(SCRIPTS_DIR);
const DATA = path.join(ROOT, 'data');

const PATHS = {
  config: path.join(ROOT, 'config.json'),
  state: path.join(DATA, 'state.json'),
  signals: path.join(DATA, 'signals.json'),
  prices: path.join(DATA, 'prices.json'),
  trades: path.join(DATA, 'trades.json'),
  equity: path.join(DATA, 'equity.jsonl'),
  journal: path.join(DATA, 'journal.jsonl'),
  playbook: path.join(DATA, 'playbook.json'),
  log: path.join(DATA, 'engine.log'),
};

// Ensure data directory exists
function ensureData() {
  if (!fs.existsSync(DATA)) {
    fs.mkdirSync(DATA, { recursive: true });
  }
}

// Read JSON file with fallback
function readJSON(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return fallback;
  }
}

// Write JSON with atomic write (temp + rename)
function writeJSON(filePath, obj) {
  ensureData();
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

// Append JSON line
function appendJSONL(filePath, obj) {
  ensureData();
  const line = JSON.stringify(obj);
  fs.appendFileSync(filePath, line + '\n', 'utf-8');
}

// Read last N lines from JSONL
function readJSONL(filePath, limit = 0) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    if (limit > 0 && lines.length > limit) {
      return lines.slice(-limit).map(l => JSON.parse(l));
    }
    return lines.map(l => JSON.parse(l));
  } catch (e) {
    return [];
  }
}

// Simple log to file
function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(PATHS.log, line, 'utf-8');
}

// Load config
function loadConfig() {
  return readJSON(PATHS.config);
}

// Time helpers
export function now() { return Date.now(); }
export function iso(t) {
  const ts = t == null ? Date.now() : Number(t);
  return isNaN(ts) ? new Date().toISOString() : new Date(ts).toISOString();
}

// Network helpers
async function getJSON(url) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function getText(url) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// Yahoo Finance chart helper
async function YH(symbol, range = '6mo', interval = '1d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const data = await getJSON(url);
  const result = data.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);
  return result;
}

// Fetch quote from Yahoo, fallback to Coinbase for crypto
async function fetchQuote(symbol) {
  try {
    const yh = await YH(symbol, '5d', '1m');
    const meta = yh.meta;
    const last = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose || meta.previousClose;
    const changePct = prev ? ((last - prev) / prev) * 100 : 0;

    return {
      symbol,
      price: last,
      prevClose: prev,
      changePct,
      marketState: meta.marketState || 'REGULAR',
      currency: meta.currency || 'USD',
      sessionStart: meta.chartStartSlashTime || meta.regularMarketTime,
      ok: true
    };
  } catch (e) {
    // Fallback to Coinbase for -USD symbols
    if (symbol.endsWith('-USD')) {
      try {
        const coinSymbol = symbol.replace('-USD', '');
        const url = `https://api.coinbase.com/v2/prices/${coinSymbol}/spot`;
        const data = await getJSON(url);
        const price = parseFloat(data.data?.amount);
        return {
          symbol,
          price,
          prevClose: null,
          changePct: null,
          marketState: 'UNKNOWN',
          currency: 'USD',
          sessionStart: null,
          ok: true
        };
      } catch (e2) {
        return { symbol, ok: false, error: e2.message };
      }
    }
    return { symbol, ok: false, error: e.message };
  }
}

// Fetch history (daily closes)
async function fetchHistory(symbol, range = '6mo', interval = '1d') {
  try {
    const yh = await YH(symbol, range, interval);
    const timestamps = yh.timestamp || yh.indicators?.quote?.[0]?.timestamp;
    const closes = yh.indicators?.quote?.[0]?.close || [];

    if (!timestamps || !closes) return [];

    // Return array of numeric closes
    return closes.filter(c => c != null);
  } catch (e) {
    return [];
  }
}

// Fetch USD to INR rate
async function fetchFx() {
  try {
    const yh = await YH('USDINR=X', '5d', '1d');
    return yh.meta.regularMarketPrice;
  } catch (e) {
    return 83.0;
  }
}

// Simple Moving Average
function sma(arr, n) {
  if (arr.length < n) return null;
  let sum = 0;
  for (let i = arr.length - n; i < arr.length; i++) {
    sum += arr[i];
  }
  return sum / n;
}

// RSI
function rsi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / n;
  const avgLoss = losses / n;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Momentum
function momentum(closes, n = 10) {
  if (closes.length < n + 1) return null;
  return (closes[closes.length - 1] - closes[closes.length - n - 1]) / closes[closes.length - n - 1];
}

// Full indicators
function indicators(closes) {
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const r = rsi(closes);
  const m = momentum(closes);

  // Trend: compare price to SMAs
  const last = closes[closes.length - 1];
  let trend = 'flat';
  if (sma20 && last > sma20 * 1.02) trend = 'up';
  else if (sma20 && last < sma20 * 0.98) trend = 'down';

  // Bias: RSI + momentum
  let bias = 'neutral';
  if (r && r > 60 && m && m > 0.05) bias = 'bullish';
  else if (r && r < 40 && m && m < -0.05) bias = 'bearish';

  return { sma20, sma50, rsi: r, mom: m, trend, bias };
}

// Stats helpers
function sha256(s) {
  // Simple hash for debugging - not real crypto
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h = h & h;
  }
  let hex = Math.abs(h).toString(16);
  while (hex.length < 16) hex = '0' + hex;
  return hex.slice(0, 16);
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const sqDiffs = arr.map(x => Math.pow(x - m, 2));
  const variance = sqDiffs.reduce((a, b) => a + b, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// Wilson lower bound
function wilsonLB(wins, n, z = 1.96) {
  if (n === 0) return 0;
  const p = wins / n;
  const left = p + (z * z) / (2 * n);
  const right = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  const denom = 1 + (z * z) / n;
  return (left - right) / denom;
}

// System Quality Number
function sqnOf(returns) {
  if (returns.length < 2) return 0;
  const m = mean(returns);
  const s = stdev(returns);
  if (s === 0) return 0;
  return Math.sqrt(returns.length) * (m / s);
}

// Profit factor
function profitFactor(returns) {
  let gains = 0, losses = 0;
  for (const r of returns) {
    if (r > 0) gains += r;
    else losses += Math.abs(r);
  }
  return losses === 0 ? (gains > 0 ? Infinity : 0) : gains / losses;
}

// Expectancy stats
function expectancyStats(returns) {
  const n = returns.length;
  if (n === 0) return { n: 0, wins: 0, losses: 0, winRate: 0, avgWinR: 0, avgLossR: 0, expectancyR: 0, profitFactor: 0, sqn: 0, wilsonLb: 0, breakevenWr: 0, tStat: 0 };

  const wins = returns.filter(r => r > 0);
  const losses = returns.filter(r => r <= 0);
  const winRate = wins.length / n;
  const avgWinR = wins.length ? mean(wins) : 0;
  const avgLossR = losses.length ? mean(losses) : 0;
  const expectancyR = mean(returns);
  const pf = profitFactor(returns);
  const sqn = sqnOf(returns);
  const wl = wilsonLB(wins.length, n);

  // Breakeven win rate
  const breakevenWr = avgLossR === 0 ? 1 : -avgLossR / (avgWinR - avgLossR);

  // Simple t-stat for expectancy
  const m = mean(returns);
  const s = stdev(returns);
  const tStat = s === 0 ? (m > 0 ? Infinity : -Infinity) : (m / s) * Math.sqrt(n);

  return { n, wins: wins.length, losses: losses.length, winRate, avgWinR, avgLossR, expectancyR, profitFactor: pf, sqn, wilsonLb: wl, breakevenWr, tStat };
}

// Regime detection from BTC-USD, ^GSPC, ^NSEI
async function regime(quotes, riskState) {
  // quotes: { "BTC-USD": [...closes], "^GSPC": [...], "^NSEI": [...] }
  // riskState: { ddCaution: bool, ddHalt: bool }

  const getMom = (arr) => {
    if (!arr || arr.length < 20) return 0;
    return (arr[arr.length - 1] - arr[arr.length - 20]) / arr[arr.length - 20];
  };

  const btc = getMom(quotes['BTC-USD']);
  const spy = getMom(quotes['^GSPC']);
  const nifty = getMom(quotes['^NSEI']);

  // Risk-off if drawdown halt
  if (riskState?.ddHalt) return 'risk_off';

  // Broad up: all three positive
  if (btc > 0 && spy > 0 && nifty > 0) return 'broad_up';

  // Crypto down with high vol
  if (btc < -0.15) return 'crypto_down_highvol';

  // Crypto down
  if (btc < 0) return 'crypto_down';

  // US down
  if (spy < 0) return 'us_down';

  return 'mixed_chop';
}

export {
  ROOT, DATA, PATHS,
  ensureData, readJSON, writeJSON, appendJSONL, readJSONL, log,
  loadConfig,
  getJSON, getText, YH, fetchQuote, fetchHistory, fetchFx,
  sma, rsi, momentum, indicators,
  sha256, mean, stdev, wilsonLB, sqnOf, profitFactor, expectancyStats,
  regime
};
