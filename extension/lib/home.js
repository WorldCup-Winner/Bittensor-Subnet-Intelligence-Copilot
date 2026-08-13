/**
 * Extension home dashboard aggregates (demo + live-capable).
 */

import { collectSubnetMetrics } from "./metrics.js";
import { calculateScorecard } from "./scoring.js";
import { listWatchlist } from "./watchlist.js";
import { rowsFrom, taostatsGet, pick } from "./taostats.js";

const DEFAULT_SCAN = [18, 21, 34, 41, 64, 72, 9, 12];

async function candidateNetuids(apiKey, forceDemo) {
  if (forceDemo || !apiKey) return DEFAULT_SCAN;
  try {
    const payload = await taostatsGet(`/api/subnet/latest/v1?limit=40`, apiKey);
    const ids = rowsFrom(payload)
      .map((row) => Number(pick(row, ["netuid"], NaN)))
      .filter((n) => Number.isInteger(n) && n > 0);
    return [...new Set(ids)].slice(0, 12);
  } catch {
    return DEFAULT_SCAN;
  }
}

/**
 * @param {{ taostatsApiKey?: string, forceDemo?: boolean }} options
 */
export async function buildHomeDashboard(options = {}) {
  const { taostatsApiKey = "", forceDemo = false } = options;
  const netuids = await candidateNetuids(taostatsApiKey, forceDemo);
  const cards = [];

  for (const netuid of netuids.slice(0, 8)) {
    try {
      const metrics = await collectSubnetMetrics(netuid, {
        taostatsApiKey,
        forceDemo: forceDemo || !taostatsApiKey,
        skipHistory: true,
      });
      // Attach lightweight synthetic 7d momentum from changes if present
      const scorecard = calculateScorecard(metrics);
      const momentumDelta =
        scorecard.changes7d?.find((c) => c.label === "Miners")?.value ??
        scorecard.changes7d?.find((c) => c.label === "Stake")?.value ??
        null;
      cards.push({
        netuid: scorecard.netuid,
        name: scorecard.name,
        overall: scorecard.overall,
        health: scorecard.health,
        decision: scorecard.decision,
        momentum: scorecard.scores.momentum,
        risk: scorecard.scores.risk,
        momentumDelta,
      });
    } catch {
      // skip
    }
  }

  const topOpportunities = [...cards]
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 5);

  const biggestMomentum = [...cards]
    .filter((c) => c.momentumDelta != null)
    .sort((a, b) => (b.momentumDelta || 0) - (a.momentumDelta || 0))
    .slice(0, 5);

  // If no deltas (skipHistory), fall back to momentum score ranking
  const momentumBoard =
    biggestMomentum.length > 0
      ? biggestMomentum
      : [...cards].sort((a, b) => b.momentum - a.momentum).slice(0, 5);

  const riskAlerts = [...cards]
    .filter((c) => c.risk < 55 || c.health.tone === "bad")
    .sort((a, b) => a.risk - b.risk)
    .slice(0, 5)
    .map((c) => ({
      netuid: c.netuid,
      name: c.name,
      text:
        c.risk < 55
          ? `Risk safety soft (${c.risk}/100)`
          : `Health flagged (${c.health.label})`,
      tone: "bad",
    }));

  const watchlist = await listWatchlist();

  return {
    generatedAt: new Date().toISOString(),
    source: forceDemo || !taostatsApiKey ? "demo" : "taostats",
    topOpportunities,
    biggestMomentum: momentumBoard,
    riskAlerts,
    watchlist,
  };
}
