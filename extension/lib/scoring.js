/**
 * TAO Scout score model (MVP):
 * Health, Momentum, Development, Market, Risk, Competition → Overall
 */

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function sigmoidScore(value, midpoint, steepness = 1) {
  const x = (value - midpoint) * steepness;
  return 100 / (1 + Math.exp(-x));
}

/** Network/subnet health: participation + validator coverage + registration openness */
export function scoreHealth(metrics) {
  const miners = Number(metrics.subnet?.active_miners || 0);
  const validators = Number(metrics.subnet?.active_validators || 0);
  const maxNeurons = Number(metrics.subnet?.max_neurons || 256) || 256;
  const maxValidators = Number(metrics.subnet?.max_validators || 64) || 64;
  const registrationAllowed = metrics.subnet?.registration_allowed !== false;

  const minerFill = clamp((miners / maxNeurons) * 100);
  const validatorFill = clamp((validators / maxValidators) * 110);
  const openBonus = registrationAllowed ? 6 : -12;
  const thinPenalty = miners < 24 ? 12 : miners < 48 ? 6 : 0;

  return clamp(minerFill * 0.35 + validatorFill * 0.45 + 20 + openBonus - thinPenalty);
}

/** Improving vs declining: flows + price + activity deltas */
export function scoreMomentum(metrics) {
  const flow7 = Number(metrics.subnet?.net_flow_7_days || 0);
  const flow1 = Number(metrics.subnet?.net_flow_1_day || 0);
  const price7 = Number(metrics.pool?.price_change_7d || 0);
  const activityPct = Number(metrics.changes?.activity_pct ?? metrics.changes7d?.activity_pct ?? 0);

  const flowPart = sigmoidScore(flow7 * 0.7 + flow1 * 0.3, 0, 0.85);
  const pricePart = sigmoidScore(price7 * 100, 0, 0.12);
  const activityPart = sigmoidScore(activityPct, 0, 0.1);

  return clamp(flowPart * 0.4 + pricePart * 0.3 + activityPart * 0.3);
}

export function scoreDevelopment(metrics) {
  const commits = metrics.development?.commits_7d;
  const contributors = metrics.development?.contributors;
  const lastCommit = metrics.development?.last_commit_days_ago;
  const hasGithub = Boolean(metrics.identity?.github);
  const hasDesc = Boolean(metrics.identity?.description);

  if (commits == null && contributors == null) {
    let base = 55;
    if (hasGithub) base += 12;
    if (hasDesc && String(metrics.identity.description).length > 40) base += 8;
    if (metrics.subnet?.registration_allowed) base += 5;
    return clamp(base);
  }

  const commitScore = clamp(30 + Number(commits) * 2.5);
  const contribScore = clamp(40 + Number(contributors) * 6);
  const freshness = lastCommit == null ? 60 : clamp(95 - Number(lastCommit) * 6);
  return clamp(commitScore * 0.4 + contribScore * 0.35 + freshness * 0.25);
}

/** Liquidity + price activity + volume */
export function scoreMarket(metrics) {
  const liq = Number(metrics.pool?.liquidity_tao || 0);
  const volume = Number(metrics.pool?.volume_7d || 0);
  const price7 = Number(metrics.pool?.price_change_7d || 0);
  const mcap = Number(metrics.pool?.market_cap_tao || liq);

  const liqScore = clamp(25 + Math.log10(Math.max(liq, 1)) * 22);
  const volScore = clamp(25 + Math.log10(Math.max(volume, 1)) * 20);
  const mcapScore = clamp(20 + Math.log10(Math.max(mcap, 1)) * 18);
  const activityBonus = clamp(50 + Math.min(Math.abs(price7) * 80, 25));

  return clamp(liqScore * 0.35 + volScore * 0.3 + mcapScore * 0.2 + activityBonus * 0.15);
}

/**
 * Risk score: higher = safer / lower risk (matches product UI).
 */
export function scoreRisk(metrics) {
  const validators = Number(metrics.subnet?.active_validators || 0);
  const maxValidators = Number(metrics.subnet?.max_validators || 64) || 64;
  const miners = Number(metrics.subnet?.active_miners || 0);
  const flow7 = Number(metrics.subnet?.net_flow_7_days || 0);
  const price7 = Number(metrics.pool?.price_change_7d || 0);
  const emissionDrop = Number(metrics.changes?.emissions_pct ?? metrics.changes7d?.emissions_pct ?? 0);

  const validatorCoverage = clamp((validators / maxValidators) * 100);
  const concentrationPenalty = validators < 8 ? 25 : validators < 16 ? 12 : 0;
  const outflowPenalty = flow7 < -5 ? 20 : flow7 < 0 ? 8 : 0;
  const volatilityPenalty = Math.abs(price7) > 0.4 ? 18 : Math.abs(price7) > 0.2 ? 8 : 0;
  const thinMinerPenalty = miners < 32 ? 15 : 0;
  const emissionPenalty = emissionDrop < -15 ? 12 : emissionDrop < -8 ? 6 : 0;

  return clamp(
    validatorCoverage * 0.5 +
      48 -
      concentrationPenalty -
      outflowPenalty -
      volatilityPenalty -
      thinMinerPenalty -
      emissionPenalty
  );
}

/**
 * Competition: higher = more competitive / harder for new miners.
 * (Displayed as competition intensity.)
 */
export function scoreCompetition(metrics) {
  const miners = Number(metrics.subnet?.active_miners || 0);
  const maxNeurons = Number(metrics.subnet?.max_neurons || 256) || 256;
  const occupancy = miners / maxNeurons;
  const regCost = Number(metrics.subnet?.neuron_registration_cost || 0);
  const registrationAllowed = metrics.subnet?.registration_allowed !== false;

  const occupancyScore = clamp(occupancy * 110);
  const costScore = clamp(Math.min(regCost, 5) * 16);
  const closedPenalty = registrationAllowed ? 0 : 20;

  return clamp(occupancyScore * 0.55 + costScore * 0.3 + 15 + closedPenalty);
}

function overallFromParts(parts) {
  // Competition is inverted for overall (high competition hurts research appeal slightly)
  const competitionHealth = 100 - parts.competition;
  return clamp(
    parts.health * 0.22 +
      parts.momentum * 0.2 +
      parts.development * 0.16 +
      parts.market * 0.16 +
      parts.risk * 0.16 +
      competitionHealth * 0.1
  );
}

function healthBadge(overall) {
  if (overall >= 80) return { label: "HEALTHY", tone: "good" };
  if (overall >= 65) return { label: "PROMISING", tone: "good" };
  if (overall >= 50) return { label: "MIXED", tone: "warn" };
  if (overall >= 35) return { label: "WEAK", tone: "bad" };
  return { label: "RISKY", tone: "bad" };
}

function trendLabel(parts) {
  if (parts.momentum >= 75) return { label: "Improving", tone: "good" };
  if (parts.momentum <= 40) return { label: "Cooling", tone: "bad" };
  return { label: "Stable", tone: "neutral" };
}

function riskLabel(riskScore) {
  if (riskScore >= 75) return { label: "Low risk", tone: "good" };
  if (riskScore >= 55) return { label: "Medium risk", tone: "warn" };
  return { label: "High risk", tone: "bad" };
}

function competitionLabel(competitionScore) {
  if (competitionScore >= 75) return { label: "High competition", tone: "bad" };
  if (competitionScore >= 45) return { label: "Medium competition", tone: "warn" };
  return { label: "Lower competition", tone: "good" };
}

function verdict(overall, parts) {
  if (overall >= 72 && parts.risk >= 50) {
    return { label: "WORTH RESEARCHING", tone: "good", emoji: "🟢" };
  }
  if (overall >= 55) {
    return { label: "WATCHLIST CANDIDATE", tone: "warn", emoji: "🟡" };
  }
  return { label: "SKIP FOR NOW", tone: "bad", emoji: "🔴" };
}

function formatChange(value, label) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  return {
    label,
    value: n,
    display: `${n >= 0 ? "↑" : "↓"} ${label.padEnd(12)} ${n >= 0 ? "+" : ""}${n.toFixed(1)}%`,
  };
}

function buildStrengthsWeaknesses(parts) {
  const entries = [
    { key: "health", label: "Health", score: parts.health },
    { key: "momentum", label: "Momentum", score: parts.momentum },
    { key: "development", label: "Development", score: parts.development },
    { key: "market", label: "Market", score: parts.market },
    { key: "risk", label: "Risk safety", score: parts.risk },
    { key: "competition", label: "Competition pressure", score: 100 - parts.competition },
  ];

  const strengths = entries
    .filter((e) => e.score >= 70)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((e) => ({
      key: e.key,
      label: e.label,
      score: e.key === "competition" ? parts.competition : e.score,
      text:
        e.key === "competition"
          ? `Manageable competition (${parts.competition}/100 intensity)`
          : `Strong ${e.label.toLowerCase()} (${e.score}/100)`,
    }));

  const weaknesses = [
    ...entries
      .filter((e) => e.key !== "competition" && e.score < 55)
      .map((e) => ({
        key: e.key,
        label: e.label,
        score: e.score,
        text: `Weak ${e.label.toLowerCase()} (${e.score}/100)`,
      })),
    ...(parts.competition >= 70
      ? [
          {
            key: "competition",
            label: "Competition",
            score: parts.competition,
            text: `High miner competition (${parts.competition}/100)`,
          },
        ]
      : []),
  ]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  if (!strengths.length) {
    strengths.push({
      key: "overall",
      label: "Balanced",
      score: parts.health,
      text: "No standout strengths — profile is middling across dimensions",
    });
  }
  if (!weaknesses.length) {
    weaknesses.push({
      key: "overall",
      label: "Stable",
      score: parts.risk,
      text: "No major weaknesses in the MVP scorecard",
    });
  }

  return { strengths, weaknesses };
}

function buildWatchSignals(parts, metrics) {
  const signals = [];
  const c7 = metrics.changes7d || metrics.changes || {};
  const c30 = metrics.changes30d || {};

  if (parts.momentum >= 70) signals.push("Watch whether momentum holds over the next 7 days");
  if (Number(c7.stake_pct) > 10) signals.push("Stake inflow is elevated — confirm it is not a one-day spike");
  if (Number(c7.emissions_pct) < -8) signals.push("Emissions slipped recently — check if the trend continues");
  if (parts.competition >= 70) signals.push("Competition is high — registration cost / occupancy matter");
  if (parts.development < 55) signals.push("Development footprint is thin — verify GitHub / product progress");
  if (parts.risk < 55) signals.push("Risk safety is soft — validator concentration and outflows");
  if (Number(c30.activity_pct) > 12) signals.push("30D miner activity rising — thesis may be strengthening");
  if (!signals.length) signals.push("Re-check score and stake flow in a few days");

  return signals.slice(0, 4);
}

function collectChanges(bag) {
  return [
    formatChange(bag?.stake_pct, "Stake"),
    formatChange(bag?.activity_pct, "Miners"),
    formatChange(bag?.validators_pct, "Validators"),
    formatChange(bag?.emissions_pct, "Emissions"),
    formatChange(bag?.price_pct, "Price"),
    formatChange(bag?.developers_pct, "Dev signal"),
  ].filter(Boolean);
}

/**
 * @param {object} metrics
 */
export function calculateScorecard(metrics) {
  const parts = {
    health: scoreHealth(metrics),
    momentum: scoreMomentum(metrics),
    development: scoreDevelopment(metrics),
    market: scoreMarket(metrics),
    risk: scoreRisk(metrics),
    competition: scoreCompetition(metrics),
  };

  const overall = overallFromParts(parts);
  const health = healthBadge(overall);
  const trend = trendLabel(parts);
  const risk = riskLabel(parts.risk);
  const competition = competitionLabel(parts.competition);
  const decision = verdict(overall, parts);
  const { strengths, weaknesses } = buildStrengthsWeaknesses(parts);

  const changes7d = collectChanges(metrics.changes7d || metrics.changes);
  const changes30d = collectChanges(metrics.changes30d);

  const dimensions = [
    { key: "health", label: "Health", icon: "💚", score: parts.health },
    { key: "momentum", label: "Momentum", icon: "📈", score: parts.momentum },
    { key: "development", label: "Development", icon: "👨‍💻", score: parts.development },
    { key: "market", label: "Market", icon: "💰", score: parts.market },
    { key: "risk", label: "Risk (higher = safer)", icon: "🛡", score: parts.risk },
    { key: "competition", label: "Competition", icon: "⛏", score: parts.competition },
  ];

  const scores = { ...parts, overall };

  return {
    netuid: metrics.netuid,
    name: metrics.identity?.name || `SN${metrics.netuid}`,
    description: metrics.identity?.description || "",
    source: metrics.source,
    warning: metrics.warning || null,
    overall,
    scores,
    health,
    trend,
    risk,
    competition,
    decision,
    dimensions,
    strengths,
    weaknesses,
    watchSignals: buildWatchSignals(parts, metrics),
    changes: changes7d,
    changes7d,
    changes30d,
    history: metrics.history || null,
    network: {
      emission: metrics.subnet?.emission ?? null,
      active_miners: metrics.subnet?.active_miners ?? null,
      active_validators: metrics.subnet?.active_validators ?? null,
      max_neurons: metrics.subnet?.max_neurons ?? null,
      registration_cost: metrics.subnet?.neuron_registration_cost ?? null,
      registration_allowed: metrics.subnet?.registration_allowed ?? null,
      net_flow_1_day: metrics.subnet?.net_flow_1_day ?? null,
      net_flow_7_days: metrics.subnet?.net_flow_7_days ?? null,
      net_flow_30_days: metrics.subnet?.net_flow_30_days ?? null,
      price: metrics.pool?.price ?? null,
      liquidity_tao: metrics.pool?.liquidity_tao ?? null,
      market_cap_tao: metrics.pool?.market_cap_tao ?? null,
      volume_7d: metrics.pool?.volume_7d ?? null,
    },
    development: metrics.development || null,
    identity: metrics.identity || null,
    metrics,
  };
}

export const SCORE_DIMENSION_KEYS = [
  "health",
  "momentum",
  "development",
  "market",
  "risk",
  "competition",
];
