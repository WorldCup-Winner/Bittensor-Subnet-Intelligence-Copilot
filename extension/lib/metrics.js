/**
 * Fetch + normalize subnet metrics from Taostats (or fall back to demo).
 */

import { getDemoSubnetPayload } from "./demo-data.js";
import { attachSignificantWithScores, collectHistory } from "./history.js";
import { firstRow, pick, raoToTao, taostatsGet } from "./taostats.js";
import { calculateScorecard } from "./scoring.js";

function normalizeFromApi(netuid, subnetRow, poolRow, identityRow) {
  const emission = raoToTao(pick(subnetRow, ["emission", "projected_emission"], 0)) ?? 0;
  const activeMiners = Number(pick(subnetRow, ["active_miners", "activeMiners"], 0)) || 0;
  const activeValidators =
    Number(pick(subnetRow, ["active_validators", "activeValidators"], 0)) || 0;
  const maxNeurons = Number(pick(subnetRow, ["max_neurons", "maxNeurons"], 256)) || 256;
  const flow1d = raoToTao(pick(subnetRow, ["net_flow_1_day", "tao_flow"], 0)) ?? 0;
  const flow7d = raoToTao(pick(subnetRow, ["net_flow_7_days"], 0)) ?? 0;
  const flow30d = raoToTao(pick(subnetRow, ["net_flow_30_days"], 0)) ?? 0;
  const regCost =
    raoToTao(pick(subnetRow, ["neuron_registration_cost", "registration_cost"], 0)) ?? 0;

  const price = Number(pick(poolRow, ["price", "alpha_price", "tao_price"], 0)) || 0;
  const liquidity =
    raoToTao(pick(poolRow, ["liquidity", "liquidity_tao", "tao_in_pool", "total_tao"], 0)) ?? 0;
  const volume7d =
    raoToTao(pick(poolRow, ["volume_7d", "volume_7_days", "volume"], 0)) ?? 0;
  const priceChange7d =
    Number(pick(poolRow, ["price_change_7d", "change_7d", "pct_change_7d"], 0)) || 0;
  const priceChange1d =
    Number(pick(poolRow, ["price_change_1d", "change_1d", "pct_change_1d"], 0)) || 0;

  const name = pick(identityRow, ["name", "subnet_name", "subnetName"], `Subnet ${netuid}`);
  const description = pick(identityRow, ["description", "subnet_description"], "");
  const github = pick(identityRow, ["github", "github_url", "repo"], null);
  const website = pick(identityRow, ["url", "website", "website_url"], null);

  return {
    source: "taostats",
    netuid,
    identity: { name, description, github, website },
    subnet: {
      emission,
      active_miners: activeMiners,
      active_validators: activeValidators,
      active_keys: Number(pick(subnetRow, ["active_keys"], activeMiners + activeValidators)) || 0,
      max_neurons: maxNeurons,
      max_validators: Number(pick(subnetRow, ["max_validators"], 64)) || 64,
      registration_allowed: Boolean(pick(subnetRow, ["registration_allowed"], true)),
      neuron_registration_cost: regCost,
      difficulty: Number(pick(subnetRow, ["difficulty"], 0)) || 0,
      immunity_period: Number(pick(subnetRow, ["immunity_period"], 0)) || 0,
      net_flow_1_day: flow1d,
      net_flow_7_days: flow7d,
      net_flow_30_days: flow30d,
    },
    pool: {
      price,
      price_change_1d: priceChange1d,
      price_change_7d: priceChange7d,
      volume_7d: volume7d,
      liquidity_tao: liquidity,
      market_cap_tao: raoToTao(pick(poolRow, ["market_cap", "market_cap_tao"], liquidity)) ?? liquidity,
    },
    development: {
      commits_7d: null,
      contributors: null,
      open_prs: null,
      last_commit_days_ago: null,
    },
    changes: {},
    history: null,
  };
}

/**
 * @param {number} netuid
 * @param {{ taostatsApiKey?: string, forceDemo?: boolean, skipHistory?: boolean }} options
 */
export async function collectSubnetMetrics(netuid, options = {}) {
  const { taostatsApiKey, forceDemo = false, skipHistory = false } = options;

  let metrics;
  if (forceDemo || !taostatsApiKey) {
    metrics = getDemoSubnetPayload(netuid);
  } else {
    try {
      const [subnetPayload, poolPayload, identityPayload] = await Promise.all([
        taostatsGet(`/api/subnet/latest/v1?netuid=${netuid}`, taostatsApiKey),
        taostatsGet(`/api/dtao/pool/latest/v1?netuid=${netuid}`, taostatsApiKey).catch(() => null),
        taostatsGet(`/api/subnet/identity/v1?netuid=${netuid}`, taostatsApiKey).catch(() => null),
      ]);

      const subnetRow = firstRow(subnetPayload);
      if (!subnetRow) {
        throw new Error("No subnet data returned");
      }

      metrics = normalizeFromApi(
        netuid,
        subnetRow,
        firstRow(poolPayload),
        firstRow(identityPayload)
      );
    } catch (err) {
      metrics = getDemoSubnetPayload(netuid);
      metrics.source = "demo_fallback";
      metrics.warning = err instanceof Error ? err.message : String(err);
    }
  }

  if (skipHistory) {
    metrics.history = null;
    metrics.changes7d = metrics.changes || {};
    metrics.changes30d = {};
    return metrics;
  }

  const history = await collectHistory(netuid, metrics, {
    taostatsApiKey: metrics.source === "taostats" ? taostatsApiKey : "",
    forceDemo: metrics.source !== "taostats",
  });

  metrics.history = history;
  metrics.changes7d = history.changes7d || history.changes || {};
  metrics.changes30d = history.changes30d || {};
  metrics.changes = metrics.changes7d;

  // Enrich significant events with score context after scoring
  const preview = calculateScorecard(metrics);
  metrics.history = attachSignificantWithScores(history, preview.scores);

  return metrics;
}
