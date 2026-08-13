/**
 * Deterministic demo metrics so the extension works without API keys.
 */

function hashNetuid(netuid) {
  let x = (Number(netuid) + 1) * 2654435761;
  x ^= x >>> 16;
  return Math.abs(x);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {number} netuid
 */
export function getDemoSubnetPayload(netuid) {
  const h = hashNetuid(netuid);
  const emission = 0.5 + ((h % 400) / 1000);
  const activeMiners = 64 + (h % 180);
  const activeValidators = 8 + (h % 56);
  const maxNeurons = 256;
  const flow1d = ((h % 200) - 80) / 100;
  const flow7d = ((h % 300) - 100) / 80;
  const flow30d = ((h % 400) - 120) / 60;
  const regCost = 0.2 + ((h % 50) / 100);
  const difficulty = 1e12 * (1 + (h % 40) / 10);
  const priceChange7d = ((h % 60) - 25) / 100;
  const volume7d = 50 + (h % 400);
  const liquidity = 200 + (h % 800);
  const commits7d = h % 40;
  const contributors = 1 + (h % 12);

  return {
    source: "demo",
    netuid,
    identity: {
      name: `Demo Subnet ${netuid}`,
      description: "Synthetic demo data for TAO Scout MVP (no Taostats key configured).",
      github: null,
      website: null,
    },
    subnet: {
      emission,
      active_miners: activeMiners,
      active_validators: activeValidators,
      active_keys: activeMiners + activeValidators,
      max_neurons: maxNeurons,
      max_validators: 64,
      registration_allowed: true,
      neuron_registration_cost: regCost,
      difficulty,
      immunity_period: 4096,
      net_flow_1_day: flow1d,
      net_flow_7_days: flow7d,
      net_flow_30_days: flow30d,
    },
    pool: {
      price: 0.01 + ((h % 90) / 1000),
      price_change_1d: ((h % 20) - 8) / 100,
      price_change_7d: priceChange7d,
      volume_7d: volume7d,
      liquidity_tao: liquidity,
      market_cap_tao: liquidity * (1.5 + (h % 20) / 10),
    },
    development: {
      commits_7d: commits7d,
      contributors,
      open_prs: h % 8,
      last_commit_days_ago: h % 14,
    },
    changes: {
      stake_pct: clamp(flow7d * 12, -35, 40),
      activity_pct: clamp(((activeMiners / maxNeurons) - 0.45) * 40, -25, 30),
      developers_pct: clamp((commits7d - 10) * 1.2, -20, 35),
      emissions_pct: clamp(((emission - 0.7) * 20), -15, 15),
    },
  };
}
