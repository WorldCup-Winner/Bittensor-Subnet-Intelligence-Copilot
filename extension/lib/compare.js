/**
 * Matrix comparison for 2–5 subnets.
 */

import { collectSubnetMetrics } from "./metrics.js";
import { calculateScorecard, SCORE_DIMENSION_KEYS } from "./scoring.js";
import { generateComparison } from "./ai.js";

const MAX_COMPARE = 5;

/**
 * @param {number[]} netuids
 * @param {{ taostatsApiKey?: string, forceDemo?: boolean, openaiApiKey?: string }} options
 */
export async function compareSubnetsMatrix(netuids, options = {}) {
  const unique = [...new Set(netuids.map(Number))]
    .filter((n) => Number.isInteger(n) && n >= 0 && n < 1024)
    .slice(0, MAX_COMPARE);

  if (unique.length < 2) {
    throw new Error("Add at least 2 subnets to compare");
  }

  const scorecards = [];
  for (const netuid of unique) {
    const metrics = await collectSubnetMetrics(netuid, {
      taostatsApiKey: options.taostatsApiKey,
      forceDemo: options.forceDemo,
      skipHistory: false,
    });
    scorecards.push(calculateScorecard(metrics));
  }

  const matrix = {
    netuids: scorecards.map((s) => s.netuid),
    names: Object.fromEntries(scorecards.map((s) => [s.netuid, s.name])),
    overall: Object.fromEntries(scorecards.map((s) => [s.netuid, s.overall])),
    dimensions: SCORE_DIMENSION_KEYS.map((key) => ({
      key,
      label: key[0].toUpperCase() + key.slice(1),
      values: Object.fromEntries(
        scorecards.map((s) => [s.netuid, s.scores?.[key] ?? null])
      ),
    })),
    changes7d: Object.fromEntries(
      scorecards.map((s) => [
        s.netuid,
        Object.fromEntries((s.changes7d || []).map((c) => [c.label, c.value])),
      ])
    ),
  };

  const ranked = [...scorecards].sort((a, b) => b.overall - a.overall);
  const ai = await generateComparison(scorecards, {
    openaiApiKey: options.openaiApiKey || "",
  });

  return {
    scorecards,
    matrix,
    strongest: {
      netuid: ranked[0].netuid,
      name: ranked[0].name,
      overall: ranked[0].overall,
    },
    explanation: ai,
  };
}

export { MAX_COMPARE };
