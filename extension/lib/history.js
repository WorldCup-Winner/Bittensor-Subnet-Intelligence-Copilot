/**
 * Historical intelligence: 7D + 30D deltas, series, significant changes.
 */

import { getDemoSubnetPayload } from "./demo-data.js";
import {
  parseTimestamp,
  pctChange,
  pick,
  raoToTao,
  rowsFrom,
  taostatsGet,
} from "./taostats.js";

function hashNetuid(netuid) {
  let x = (Number(netuid) + 1) * 2654435761;
  x ^= x >>> 16;
  return Math.abs(x);
}

function sortAsc(rows) {
  return [...rows].sort((a, b) => parseTimestamp(a) - parseTimestamp(b));
}

function pickNearDaysAgo(rowsAsc, days) {
  if (!rowsAsc.length) return null;
  const latestTs = parseTimestamp(rowsAsc[rowsAsc.length - 1]);
  if (!latestTs) return rowsAsc[0];
  const target = latestTs - days * 24 * 60 * 60 * 1000;
  let best = rowsAsc[0];
  let bestDist = Math.abs(parseTimestamp(best) - target);
  for (const row of rowsAsc) {
    const dist = Math.abs(parseTimestamp(row) - target);
    if (dist < bestDist) {
      best = row;
      bestDist = dist;
    }
  }
  return best;
}

function seriesFrom(rowsAsc, getter, maxPoints = 24) {
  if (!rowsAsc.length) return [];
  const step = Math.max(1, Math.floor(rowsAsc.length / maxPoints));
  const out = [];
  for (let i = 0; i < rowsAsc.length; i += step) {
    const v = getter(rowsAsc[i]);
    if (v != null && Number.isFinite(v)) out.push(v);
  }
  const last = getter(rowsAsc[rowsAsc.length - 1]);
  if (last != null && Number.isFinite(last)) {
    if (!out.length || out[out.length - 1] !== last) out.push(last);
  }
  return out.slice(-maxPoints);
}

function extractSubnetFields(row) {
  if (!row) return null;
  return {
    emission: raoToTao(pick(row, ["emission", "projected_emission"], 0)) ?? 0,
    active_miners: Number(pick(row, ["active_miners", "activeMiners"], 0)) || 0,
    active_validators: Number(pick(row, ["active_validators", "activeValidators"], 0)) || 0,
    active_keys: Number(pick(row, ["active_keys"], 0)) || 0,
    net_flow_7_days: raoToTao(pick(row, ["net_flow_7_days"], 0)) ?? 0,
    stake_proxy: raoToTao(pick(row, ["tao_in", "total_stake", "net_flow_30_days"], 0)) ?? 0,
  };
}

function extractPoolFields(row) {
  if (!row) return null;
  return {
    price: Number(pick(row, ["price", "alpha_price"], 0)) || 0,
    liquidity_tao: raoToTao(pick(row, ["liquidity", "liquidity_tao", "total_tao"], 0)) ?? 0,
    market_cap_tao: raoToTao(pick(row, ["market_cap", "market_cap_tao"], 0)) ?? 0,
  };
}

function buildWindowChanges(currentSubnet, pastSubnet, currentPool, pastPool, development) {
  const stakeBase =
    pastPool?.liquidity_tao ||
    pastPool?.market_cap_tao ||
    (pastSubnet?.stake_proxy != null ? Math.abs(pastSubnet.stake_proxy) + 1 : null) ||
    (pastSubnet?.net_flow_7_days != null ? Math.abs(pastSubnet.net_flow_7_days) + 1 : null);

  const stakeNow =
    currentPool?.liquidity_tao ||
    currentPool?.market_cap_tao ||
    (currentSubnet?.stake_proxy != null ? Math.abs(currentSubnet.stake_proxy) + 1 : null) ||
    (currentSubnet?.net_flow_7_days != null ? Math.abs(currentSubnet.net_flow_7_days) + 1 : null);

  return {
    stake_pct: pctChange(stakeNow, stakeBase),
    activity_pct: pctChange(currentSubnet?.active_miners, pastSubnet?.active_miners),
    developers_pct:
      development?.commits_7d != null
        ? Number((((Number(development.commits_7d) - 10) / 10) * 100).toFixed(1))
        : pctChange(currentSubnet?.active_validators, pastSubnet?.active_validators),
    emissions_pct: pctChange(currentSubnet?.emission, pastSubnet?.emission),
    price_pct: pctChange(currentPool?.price, pastPool?.price),
    validators_pct: pctChange(currentSubnet?.active_validators, pastSubnet?.active_validators),
  };
}

function detectSignificantChanges(changes7d, changes30d, scores) {
  const events = [];
  const push = (tone, text, value) => {
    if (value == null || !Number.isFinite(value)) return;
    if (Math.abs(value) < 8) return;
    events.push({
      tone,
      text,
      value,
      display: `${tone === "good" ? "🟢" : tone === "bad" ? "🔴" : "🟡"} ${text}`,
    });
  };

  const mom7 = changes7d?.activity_pct;
  const stake7 = changes7d?.stake_pct;
  const em7 = changes7d?.emissions_pct;
  const health30 = changes30d?.activity_pct;
  const stake30 = changes30d?.stake_pct;

  if (mom7 != null && mom7 >= 8) {
    push("good", `Momentum / miner activity increased ${mom7.toFixed(1)}% over 7 days`, mom7);
  } else if (mom7 != null && mom7 <= -8) {
    push("bad", `Miner activity decreased ${Math.abs(mom7).toFixed(1)}% over 7 days`, mom7);
  }

  if (stake7 != null && stake7 >= 10) {
    push("good", `Stake / liquidity up ${stake7.toFixed(1)}% over 7 days`, stake7);
  } else if (stake7 != null && stake7 <= -10) {
    push("bad", `Stake / liquidity down ${Math.abs(stake7).toFixed(1)}% over 7 days`, stake7);
  }

  if (em7 != null && em7 <= -8) {
    push("bad", `Emissions down ${Math.abs(em7).toFixed(1)}% over 7 days`, em7);
  } else if (em7 != null && em7 >= 8) {
    push("good", `Emissions up ${em7.toFixed(1)}% over 7 days`, em7);
  }

  if (health30 != null && health30 <= -10) {
    push("bad", `Subnet activity decreased ${Math.abs(health30).toFixed(1)}% over 30 days`, health30);
  } else if (health30 != null && health30 >= 10) {
    push("good", `Subnet activity increased ${health30.toFixed(1)}% over 30 days`, health30);
  }

  if (stake30 != null && Math.abs(stake30) >= 12) {
    push(
      stake30 >= 0 ? "good" : "bad",
      `Stake / liquidity ${stake30 >= 0 ? "increased" : "decreased"} ${Math.abs(stake30).toFixed(1)}% over 30 days`,
      stake30
    );
  }

  if (scores?.momentum != null && scores.momentum >= 80) {
    events.push({
      tone: "good",
      text: `Momentum score is elevated (${scores.momentum}/100)`,
      value: scores.momentum,
      display: `🟢 Momentum score is elevated (${scores.momentum}/100)`,
    });
  }

  // de-dupe by text
  const seen = new Set();
  return events.filter((e) => {
    if (seen.has(e.text)) return false;
    seen.add(e.text);
    return true;
  }).slice(0, 6);
}

function makeSeries(base, points, factorStart, factorEnd, wobbleSeed) {
  const out = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const wobble = Math.sin(wobbleSeed + i * 0.55) * 0.04;
    out.push(base * (factorStart + t * (factorEnd - factorStart) + wobble));
  }
  return out;
}

export function getDemoHistory(netuid) {
  const base = getDemoSubnetPayload(netuid);
  const h = hashNetuid(netuid);
  const points = 30;

  const miners = makeSeries(base.subnet.active_miners, points, 0.86, 1.05, h % 7).map(Math.round);
  const validators = makeSeries(base.subnet.active_validators, points, 0.9, 1.04, (h % 5) + 1).map(
    Math.round
  );
  const emissions = makeSeries(base.subnet.emission, points, 0.92, 1.06, h % 9).map((n) =>
    Number(n.toFixed(4))
  );
  const liquidity = makeSeries(base.pool.liquidity_tao, points, 0.82, 1.12, h % 6).map((n) =>
    Number(n.toFixed(2))
  );
  const prices = makeSeries(base.pool.price, points, 0.88, 1.1, h % 4).map((n) =>
    Number(n.toFixed(6))
  );
  const stake = liquidity.map((v, i) => Number((v * (1.1 + (i % 3) * 0.02)).toFixed(2)));

  const idx7 = Math.max(0, points - 8);
  const idx30 = 0;

  const currentSubnet = {
    emission: emissions[points - 1],
    active_miners: miners[points - 1],
    active_validators: validators[points - 1],
    net_flow_7_days: base.subnet.net_flow_7_days,
    stake_proxy: stake[points - 1],
  };
  const past7 = {
    emission: emissions[idx7],
    active_miners: miners[idx7],
    active_validators: validators[idx7],
    net_flow_7_days: base.subnet.net_flow_7_days * 0.8,
    stake_proxy: stake[idx7],
  };
  const past30 = {
    emission: emissions[idx30],
    active_miners: miners[idx30],
    active_validators: validators[idx30],
    net_flow_7_days: base.subnet.net_flow_7_days * 0.6,
    stake_proxy: stake[idx30],
  };
  const currentPool = {
    price: prices[points - 1],
    liquidity_tao: liquidity[points - 1],
    market_cap_tao: stake[points - 1],
  };
  const pool7 = {
    price: prices[idx7],
    liquidity_tao: liquidity[idx7],
    market_cap_tao: stake[idx7],
  };
  const pool30 = {
    price: prices[idx30],
    liquidity_tao: liquidity[idx30],
    market_cap_tao: stake[idx30],
  };

  const changes7d = buildWindowChanges(
    currentSubnet,
    past7,
    currentPool,
    pool7,
    base.development
  );
  const changes30d = buildWindowChanges(
    currentSubnet,
    past30,
    currentPool,
    pool30,
    base.development
  );

  return {
    source: "demo",
    windowDays: { short: 7, long: 30 },
    changes7d,
    changes30d,
    changes: changes7d,
    series: {
      miners,
      validators,
      emissions,
      liquidity,
      prices,
      stake,
    },
    significant: detectSignificantChanges(changes7d, changes30d, null),
  };
}

/**
 * @param {number} netuid
 * @param {object} currentMetrics
 * @param {{ taostatsApiKey?: string, forceDemo?: boolean }} options
 */
export async function collectHistory(netuid, currentMetrics, options = {}) {
  const { taostatsApiKey, forceDemo = false } = options;

  if (forceDemo || !taostatsApiKey) {
    return getDemoHistory(netuid);
  }

  try {
    const [subnetHist, poolHist] = await Promise.all([
      taostatsGet(
        `/api/subnet/history/v1?netuid=${netuid}&limit=120&order=timestamp_asc`,
        taostatsApiKey
      ),
      taostatsGet(
        `/api/dtao/pool/history/v1?netuid=${netuid}&limit=120&order=timestamp_asc`,
        taostatsApiKey
      ).catch(() =>
        taostatsGet(
          `/api/dtao/subnet_pool/history/v1?netuid=${netuid}&limit=120&order=timestamp_asc`,
          taostatsApiKey
        ).catch(() => null)
      ),
    ]);

    const subnetRows = sortAsc(rowsFrom(subnetHist));
    const poolRows = sortAsc(rowsFrom(poolHist));
    if (!subnetRows.length && !poolRows.length) throw new Error("No history rows");

    const currentSubnet = {
      emission: currentMetrics.subnet?.emission,
      active_miners: currentMetrics.subnet?.active_miners,
      active_validators: currentMetrics.subnet?.active_validators,
      active_keys: currentMetrics.subnet?.active_keys,
      net_flow_7_days: currentMetrics.subnet?.net_flow_7_days,
      stake_proxy: currentMetrics.pool?.liquidity_tao,
    };
    const currentPool = {
      price: currentMetrics.pool?.price,
      liquidity_tao: currentMetrics.pool?.liquidity_tao,
      market_cap_tao: currentMetrics.pool?.market_cap_tao,
    };

    const past7s = extractSubnetFields(pickNearDaysAgo(subnetRows, 7));
    const past30s = extractSubnetFields(pickNearDaysAgo(subnetRows, 30));
    const past7p = extractPoolFields(pickNearDaysAgo(poolRows, 7));
    const past30p = extractPoolFields(pickNearDaysAgo(poolRows, 30));

    const changes7d = buildWindowChanges(
      currentSubnet,
      past7s,
      currentPool,
      past7p,
      currentMetrics.development
    );
    const changes30d = buildWindowChanges(
      currentSubnet,
      past30s,
      currentPool,
      past30p,
      currentMetrics.development
    );

    return {
      source: "taostats",
      windowDays: { short: 7, long: 30 },
      changes7d,
      changes30d,
      changes: changes7d,
      series: {
        miners: seriesFrom(subnetRows, (r) => Number(pick(r, ["active_miners"], NaN))),
        validators: seriesFrom(subnetRows, (r) => Number(pick(r, ["active_validators"], NaN))),
        emissions: seriesFrom(subnetRows, (r) => raoToTao(pick(r, ["emission"], null))),
        liquidity: seriesFrom(poolRows, (r) => raoToTao(pick(r, ["liquidity", "total_tao"], null))),
        prices: seriesFrom(poolRows, (r) => Number(pick(r, ["price"], NaN))),
        stake: seriesFrom(poolRows, (r) =>
          raoToTao(pick(r, ["market_cap", "liquidity", "total_tao"], null))
        ),
      },
      significant: detectSignificantChanges(changes7d, changes30d, null),
      meta: {
        subnetPoints: subnetRows.length,
        poolPoints: poolRows.length,
      },
    };
  } catch (err) {
    const demo = getDemoHistory(netuid);
    demo.source = "demo_fallback";
    demo.warning = err instanceof Error ? err.message : String(err);
    return demo;
  }
}

export function attachSignificantWithScores(history, scores) {
  if (!history) return history;
  return {
    ...history,
    significant: detectSignificantChanges(history.changes7d, history.changes30d, scores),
  };
}
