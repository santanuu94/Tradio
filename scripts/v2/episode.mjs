// scripts/v2/episode.mjs - Episode loop management
import { V2, now, iso, appendJSONL, ensureData } from './store.mjs';

export function freshV2State(cfg) {
  const v2 = cfg.v2;
  const ts = now();

  return {
    version: 2,
    episodeNum: 1,
    episodeId: `ep_${ts}_1`,
    startedAt: ts,
    updatedAt: ts,

    startingCapital: v2.startingCapital,
    walletBalance: v2.startingCapital,
    equity: v2.startingCapital,
    peakEquity: v2.startingCapital,
    maxDrawdownPct: 0,
    realizedPnlEpisode: 0,

    positions: {},

    riskState: "normal",
    regime: "mixed_chop",
    generation: 1,

    aggression: {
      kellyFraction: v2.aggression.kellyFractionStart,
      leverageCap: v2.aggression.leverageStart,
      leverageCeiling: v2.aggression.leverageCeiling,
      unlockedLevel: 0
    },

    goal: {
      target: v2.episode.goal.target,
      deadlineHours: v2.episode.goal.deadlineHours,
      startEquity: v2.startingCapital,
      startedAt: ts
    },

    importanceAccum: 0,
    closesSinceDeep: 0,
    lastDeepReflectTs: 0,
    cycles: 0,
    blownUp: false,

    lifetime: {
      episodes: 1,
      totalBlowups: 0,
      bestEpisodeReturnPct: 0,
      bestEquityEver: v2.startingCapital,
      careerStartedAt: ts
    },

    lastWorldDeepTs: 0,
    lastWorldRegime: "neutral"
  };
}

export function recordEquityPeak(state) {
  if (state.equity > state.peakEquity) {
    state.peakEquity = state.equity;
  }

  // Compute current drawdown from peak
  const drawdown = state.peakEquity > 0
    ? (state.peakEquity - state.equity) / state.peakEquity
    : 0;

  // Track max drawdown
  if (drawdown > state.maxDrawdownPct) {
    state.maxDrawdownPct = drawdown;
  }

  // Track lifetime best equity
  if (state.equity > state.lifetime.bestEquityEver) {
    state.lifetime.bestEquityEver = state.equity;
  }

  return drawdown;
}

export function episodeEndReason(state, cfg, nowTs = now()) {
  // Blowup check
  if (state.equity <= cfg.v2.episode.blowupEquity) {
    return "blowup";
  }

  // Goal reached
  if (state.equity >= state.goal.target) {
    return "goal";
  }

  // Time limit
  const hoursSinceStart = (nowTs - state.goal.startedAt) / (1000 * 60 * 60);
  if (hoursSinceStart >= cfg.v2.episode.maxHoursPerEpisode) {
    return "time";
  }

  return null;
}

export function finalizeEpisode(state, reason, extra = {}) {
  const nowTs = now();
  const durationMs = nowTs - state.startedAt;
  const durationHours = durationMs / (1000 * 60 * 60);
  const returnPct = (state.equity - state.startingCapital) / state.startingCapital;

  const record = {
    episodeNum: state.episodeNum,
    episodeId: state.episodeId,
    startedAt: iso(state.startedAt),
    endedAt: iso(nowTs),
    durationHours: Math.round(durationHours * 100) / 100,
    startingCapital: state.startingCapital,
    finalEquity: state.equity,
    peakEquity: state.peakEquity,
    returnPct: Math.round(returnPct * 10000) / 10000,
    maxDrawdownPct: Math.round(state.maxDrawdownPct * 10000) / 10000,
    blownUp: reason === "blowup",
    endReason: reason,
    generation: state.generation,
    ...extra
  };

  // Append to episodes file
  appendJSONL(V2.episodes, record);

  // Update lifetime stats
  state.lifetime.totalBlowups += (reason === "blowup" ? 1 : 0);

  const epReturnPct = returnPct * 100;
  if (epReturnPct > state.lifetime.bestEpisodeReturnPct) {
    state.lifetime.bestEpisodeReturnPct = epReturnPct;
  }

  return record;
}

export function nextEpisode(state, cfg) {
  const ts = now();
  const newCap = cfg.v2.startingCapital;

  // Bump episode
  state.episodeNum += 1;
  state.episodeId = `ep_${ts}_${state.episodeNum}`;

  // Reset for new episode
  state.startedAt = ts;
  state.updatedAt = ts;
  state.startingCapital = newCap;
  state.walletBalance = newCap;
  state.equity = newCap;
  state.peakEquity = newCap;
  state.maxDrawdownPct = 0;
  state.realizedPnlEpisode = 0;
  state.positions = {};
  state.riskState = "normal";
  state.blownUp = false;

  // Fresh goal
  state.goal = {
    target: cfg.v2.episode.goal.target,
    deadlineHours: cfg.v2.episode.goal.deadlineHours,
    startEquity: newCap,
    startedAt: ts
  };

  // Reset episode-specific trackers
  state.importanceAccum = 0;
  state.closesSinceDeep = 0;
  state.lastDeepReflectTs = 0;
  state.cycles = 0;

  // Bump lifetime episode count (generation persists)
  state.lifetime.episodes += 1;

  return state;
}

export function setGoal(state, target, deadlineHours) {
  state.goal = {
    target,
    deadlineHours,
    startEquity: state.equity,
    startedAt: now()
  };
  return state;
}
