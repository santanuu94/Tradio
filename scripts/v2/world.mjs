// scripts/v2/world.mjs - World senses layer
import { V2, readJSON, writeJSON, now, round, clamp } from './store.mjs';
import { getJSON, getText, fetchQuote, YH } from '../lib.mjs';
import { lexiconScore, fngBand, regimeScore, aggregateNews } from '../world/score.mjs';

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================
const CACHE_TTL = {
  macro: 15 * 60 * 1000,          // 15 min
  cryptoFng: 60 * 60 * 1000,      // 60 min
  cnnFng: 60 * 60 * 1000,         // 60 min
  cboePutCall: 6 * 24 * 60 * 60 * 1000, // 6 days (stale if older)
  hyperliquid: 5 * 60 * 1000,     // 5 min
  stocktwits: 15 * 60 * 1000,      // 15 min
  fedHeadlines: 30 * 60 * 1000,    // 30 min
  cryptoNews: 20 * 60 * 1000,      // 20 min
  gdeltTone: 30 * 60 * 1000        // 30 min
};

function loadCache() {
  return readJSON(V2.world) || { sources: {}, lastUpdate: 0 };
}

function saveCache(cache) {
  cache.lastUpdate = now();
  writeJSON(V2.world, cache);
}

function getCached(key, fetchFn, ttl, staleOk = false) {
  const cache = loadCache();
  const entry = cache.sources?.[key];
  const age = now() - (entry?.ts || 0);

  if (entry && age < ttl) {
    return entry.data;
  }

  // If stale is ok and we have data, return it even if old
  if (staleOk && entry && entry.data != null) {
    return { ...entry.data, _stale: true };
  }

  // Try to fetch
  try {
    const data = fetchFn();
    cache.sources = cache.sources || {};
    cache.sources[key] = { ts: now(), data };
    saveCache(cache);
    return data;
  } catch (e) {
    // Return cached if available, even if stale
    if (entry && entry.data != null) {
      return { ...entry.data, _stale: true, _error: e.message };
    }
    // Return null with error flag
    return { _error: e.message };
  }
}

// =============================================================================
// SOURCE FETCHERS
// =============================================================================

// Macro: Yahoo quotes for ^TNX, ^VIX, DX-Y.NYB, CL=F, GC=F
async function fetchMacro() {
  const symbols = {
    TNX: '^TNX',
    VIX: '^VIX',
    DXY: 'DX-Y.NYB',
    oil: 'CL=F',
    gold: 'GC=F'
  };

  const result = {};

  for (const [key, sym] of Object.entries(symbols)) {
    try {
      const quote = await fetchQuote(sym);
      if (quote.ok) {
        result[key] = {
          price: quote.price,
          changePct: quote.changePct,
          currency: quote.currency
        };
      }
    } catch (e) {
      // Skip failed quotes
    }
  }

  return result;
}

// Crypto Fear and Greed
async function fetchCryptoFng() {
  try {
    const data = await getJSON('https://api.alternative.me/fng/?limit=1');
    if (data && data.data && data.data[0]) {
      return {
        value: parseInt(data.data[0].value_classification?.replace(/\D/g, '') || '50'),
        label: data.data[0].value_classification,
        timestamp: parseInt(data.data[0].timestamp) * 1000
      };
    }
  } catch (e) {
    // Fall through to return null
  }
  return null;
}

// CNN Fear and Greed
async function fetchCnnFng() {
  try {
    const data = await getJSON('https://production.dataviz.cnn.io/index/fearandgreed/graphdata');
    if (data?.fear_and_greed?.data) {
      const latest = data.fear_and_greed.data.slice(-1)[0];
      return {
        value: Math.round(latest.y),
        label: latest.x,
        timestamp: latest.x
      };
    }
  } catch (e) {
    // Fall through
  }
  return null;
}

// CBOE Put/Call ratio
async function fetchCboePutCall() {
  try {
    // Try current PC ratio file
    const url = 'https://www.cboe.com/delayedQuote/putcallratio.csv';
    const text = await getText(url);
    const lines = text.trim().split('\n');

    if (lines.length < 2) return null;

    // Parse last valid row
    for (let i = lines.length - 1; i >= 1; i--) {
      const parts = lines[i].split(',');
      if (parts.length >= 2) {
        const dateStr = parts[0]?.trim();
        const ratio = parseFloat(parts[1]?.trim());

        if (dateStr && !isNaN(ratio)) {
          // Check if data is stale (> 6 days old)
          const rowDate = new Date(dateStr);
          const ageDays = (now() - rowDate.getTime()) / (24 * 60 * 60 * 1000);

          if (ageDays > 6) {
            // Return stale marker
            return { ratio: null, _stale: true, ageDays: Math.round(ageDays) };
          }

          return { ratio, date: dateStr };
        }
      }
    }
  } catch (e) {
    // Fall through
  }
  return { ratio: null, _stale: true };
}

// Hyperliquid
async function fetchHyperliquid() {
  try {
    const body = JSON.stringify({
      type: "metaAndAssetCtxs",
      assetCtxs: ["BTC", "ETH", "SOL"]
    });

    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });

    const data = await response.json();

    if (!data) return null;

    const meta = data.meta || {};
    const assetCtxs = data.assetCtxs || [];

    // Extract relevant data for BTC, ETH, SOL
    const result = {
      btc: extractAssetData(assetCtxs, 'BTC'),
      eth: extractAssetData(assetCtxs, 'ETH'),
      sol: extractAssetData(assetCtxs, 'SOL')
    };

    // Calculate average funding rate (8h)
    const rates = [];
    if (result.btc?.funding) rates.push(result.btc.funding);
    if (result.eth?.funding) rates.push(result.eth.funding);
    if (result.sol?.funding) rates.push(result.sol.funding);

    result.avgFunding8h = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

    // Crowd: long/short ratio
    result.crowd = computeCrowd(result);

    return result;
  } catch (e) {
    return { _error: e.message };
  }
}

function extractAssetData(ctxs, symbol) {
  const ctx = ctxs?.find(c => c.name === symbol);
  if (!ctx) return null;

  return {
    mark: parseFloat(ctx.markPx),
    index: parseFloat(ctx.indexPx),
    openInterest: parseFloat(ctx.openInterest),
    funding: parseFloat(ctx.funding) * 100, // Convert to percentage
    longs: parseFloat(ctx.volLong),
    shorts: parseFloat(ctx.volShort)
  };
}

function computeCrowd(data) {
  const totalLongs = (data.btc?.longs || 0) + (data.eth?.longs || 0) + (data.sol?.longs || 0);
  const totalShorts = (data.btc?.shorts || 0) + (data.eth?.shorts || 0) + (data.sol?.shorts || 0);
  const total = totalLongs + totalShorts;

  if (total === 0) return null;

  const longRatio = totalLongs / total;
  return {
    longs: totalLongs,
    shorts: totalShorts,
    longRatio: round(longRatio, 3),
    read: longRatio > 0.6 ? 'longsCrowded' : longRatio < 0.4 ? 'shortsCrowded' : 'balanced'
  };
}

// StockTwits
async function fetchStocktwits() {
  const symbols = ['AAPL', 'NVDA', 'TSLA'];
  const result = {};

  for (const sym of symbols) {
    try {
      const data = await getJSON(`https://api.stocktwits.com/api/2/streams/symbol/${sym}.json`);
      if (data?.symbols?.[0]) {
        const bullish = data.symbols[0].watchlist_count || 0;
        // Estimate based on sentiment if available
        result[sym] = { symbol: sym, bullish };
      }
    } catch (e) {
      // Skip
    }
  }

  return result;
}

// Fed Headlines
async function fetchFedHeadlines() {
  try {
    const data = await getJSON('https://www.federalreserve.gov/feeds/press_all.xml');
    if (data?.rss?.channel?.item) {
      const items = Array.isArray(data.rss.channel.item)
        ? data.rss.channel.item.slice(0, 10)
        : [data.rss.channel.item];

      return items.map(item => ({
        title: item.title,
        pubDate: item.pubDate
      }));
    }
  } catch (e) {
    // Fall through
  }
  return [];
}

// Crypto News
async function fetchCryptoNews() {
  const headlines = [];

  // Cointelegraph
  try {
    const ct = await getJSON('https://cointelegraph.com/rss');
    if (ct?.items) {
      for (const item of ct.items.slice(0, 10)) {
        headlines.push({ source: 'cointelegraph', title: item.title });
      }
    }
  } catch (e) {
    // Skip
  }

  // Decrypt
  try {
    const dc = await getJSON('https://decrypt.co/feed');
    if (dc?.items) {
      for (const item of dc.items.slice(0, 5)) {
        headlines.push({ source: 'decrypt', title: item.title });
      }
    }
  } catch (e) {
    // Skip
  }

  return headlines;
}

// GDELT Tone
async function fetchGdeltTone() {
  try {
    // GDELT event search for stock market
    const url = 'https://api.gdeltproject.org/api/v2/docdoc/docdoc?query=stock%20market&mode=artlist&maxrecords=25&format=json';
    const data = await getJSON(url);
    if (data?.articles) {
      return data.articles.map(a => ({
        title: a.title,
        tone: a.tone
      }));
    }
  } catch (e) {
    // Fall through
  }
  return [];
}

// =============================================================================
// MAIN WORLD FETCH
// =============================================================================
export async function collectWorldV2(state = null) {
  const results = {};

  // Fetch all sources
  results.macro = await getCached('macro', fetchMacro, CACHE_TTL.macro);
  results.cryptoFng = await getCached('cryptoFng', fetchCryptoFng, CACHE_TTL.cryptoFng, true);
  results.cnnFng = await getCached('cnnFng', fetchCnnFng, CACHE_TTL.cnnFng, true);
  results.cboePutCall = await getCached('cboePutCall', fetchCboePutCall, CACHE_TTL.cboePutCall, true);
  results.hyperliquid = await getCached('hyperliquid', fetchHyperliquid, CACHE_TTL.hyperliquid);
  results.stocktwits = await getCached('stocktwits', fetchStocktwits, CACHE_TTL.stocktwits);
  results.fedHeadlines = await getCached('fedHeadlines', fetchFedHeadlines, CACHE_TTL.fedHeadlines);
  results.cryptoNews = await getCached('cryptoNews', fetchCryptoNews, CACHE_TTL.cryptoNews);
  results.gdeltTone = await getCached('gdeltTone', fetchGdeltTone, CACHE_TTL.gdeltTone);

  // Compute regime from macro
  const regime = regimeScore(results.macro || {});

  // Compute fear/greed bands
  const fearGreedCrypto = results.cryptoFng?.value != null
    ? { value: results.cryptoFng.value, label: fngBand(results.cryptoFng.value) }
    : { value: null, label: 'unknown' };

  const fearGreedStocks = results.cnnFng?.value != null
    ? { value: results.cnnFng.value, label: fngBand(results.cnnFng.value) }
    : { value: null, label: 'unknown' };

  // CBOE put/call - show dash if stale or missing
  const putCall = results.cboePutCall;
  const putCallValue = (putCall?.ratio != null && !putCall._stale)
    ? round(putCall.ratio, 2)
    : '-';

  // Hyperliquid funding
  const fundingRate = results.hyperliquid?.avgFunding8h != null
    ? round(results.hyperliquid.avgFunding8h * 100, 4)
    : 0;

  // Whale crowd
  const whaleCrowd = results.hyperliquid?.crowd?.read || 'unknown';

  // Open interest in USD (rough)
  const oiUsd = results.hyperliquid
    ? ((results.hyperliquid.btc?.openInterest || 0) * (results.hyperliquid.btc?.mark || 0) +
       (results.hyperliquid.eth?.openInterest || 0) * (results.hyperliquid.eth?.mark || 0))
    : 0;

  // Fed headlines
  const fed = Array.isArray(results.fedHeadlines) ? results.fedHeadlines.slice(0, 5).map(h => h.title) : [];

  // News mood
  const newsMood = aggregateNews(Array.isArray(results.cryptoNews) ? results.cryptoNews : []);

  // Social
  const social = results.stocktwits || {};

  // Thesis (simple rule-based)
  const thesis = buildThesis(regime, fearGreedCrypto, fearGreedStocks, whaleCrowd, newsMood);

  // Deep due
  const deep_due = {
    macroAge: now() - (loadCache().sources?.macro?.ts || 0),
    fngAge: now() - (loadCache().sources?.cryptoFng?.ts || 0),
    staleSources: Object.entries(loadCache().sources || {})
      .filter(([k, v]) => (now() - v.ts) > CACHE_TTL[k])
      .map(([k, v]) => k)
  };

  // Update state funding rate if provided
  if (state && fundingRate !== null) {
    state.fundingRate = fundingRate;
  }

  // Return compact digest
  return {
    regime: regime.label,
    risk_posture: regime.posture,
    macro: regime.drivers,
    crypto: results.hyperliquid ? {
      btc_mark: results.hyperliquid.btc?.mark,
      eth_mark: results.hyperliquid.eth?.mark,
      sol_mark: results.hyperliquid.sol?.mark
    } : null,
    fearGreedCrypto,
    fearGreedStocks,
    putCall: putCallValue,
    fundingRate,
    whaleCrowd,
    oiUsd: oiUsd > 0 ? round(oiUsd / 1e9, 2) + 'B' : '-',
    fed,
    headlines: (Array.isArray(results.cryptoNews) ? results.cryptoNews : []).slice(0, 5).map(n => n.title),
    newsMood,
    social,
    thesis,
    deep_due,
    _fetchedAt: now()
  };
}

function buildThesis(regime, fngCrypto, fngStocks, crowd, newsMood) {
  const parts = [];

  // Regime
  parts.push(regime.label === 'risk_off' ? 'defensive_posture' : regime.label === 'risk_on' ? 'risk_on_mode' : 'neutral');

  // Fear/greed
  if (fngCrypto?.label === 'extreme_fear' || fngStocks?.label === 'extreme_fear') {
    parts.push('extreme_fear_contrarian');
  } else if (fngCrypto?.label === 'extreme_greed' || fngStocks?.label === 'extreme_greed') {
    parts.push('extreme_greed_caution');
  }

  // Crowd
  if (crowd === 'longsCrowded') parts.push('longs_crowded');
  else if (crowd === 'shortsCrowded') parts.push('shorts_crowded');

  // News
  if (newsMood?.mixed) parts.push('news_mixed');
  else if (newsMood?.mean_s > 0.2) parts.push('news_bullish');
  else if (newsMood?.mean_s < -0.2) parts.push('news_bearish');

  return parts.join(' | ');
}

// =============================================================================
// EXPORTS
// =============================================================================
export { lexiconScore, fngBand, regimeScore, aggregateNews };
