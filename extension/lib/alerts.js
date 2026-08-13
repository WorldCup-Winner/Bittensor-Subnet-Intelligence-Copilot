/**
 * Watchlist alerts: score / stake / emission / price / miner changes.
 * Evaluated on analyze + periodic alarm refresh.
 */

const ALERTS_KEY = "alerts";
const ALERT_SETTINGS_KEY = "alertSettings";
const MAX_ALERTS = 80;

export const DEFAULT_ALERT_SETTINGS = {
  enabled: true,
  scoreChange: 8,
  stakeChangePct: 10,
  emissionChangePct: 8,
  priceChangePct: 12,
  minerChangePct: 10,
  riskDrop: 10,
};

async function readAlerts() {
  const stored = await chrome.storage.local.get({ [ALERTS_KEY]: [] });
  return Array.isArray(stored[ALERTS_KEY]) ? stored[ALERTS_KEY] : [];
}

async function writeAlerts(alerts) {
  await chrome.storage.local.set({ [ALERTS_KEY]: alerts.slice(0, MAX_ALERTS) });
  return alerts.slice(0, MAX_ALERTS);
}

export async function getAlertSettings() {
  const stored = await chrome.storage.local.get({
    [ALERT_SETTINGS_KEY]: DEFAULT_ALERT_SETTINGS,
  });
  return { ...DEFAULT_ALERT_SETTINGS, ...(stored[ALERT_SETTINGS_KEY] || {}) };
}

export async function setAlertSettings(partial) {
  const current = await getAlertSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [ALERT_SETTINGS_KEY]: next });
  return next;
}

export async function listAlerts() {
  const alerts = await readAlerts();
  return alerts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function clearAlerts() {
  await writeAlerts([]);
  return [];
}

export async function markAlertsRead() {
  const alerts = await readAlerts();
  const next = alerts.map((a) => ({ ...a, read: true }));
  await writeAlerts(next);
  return next;
}

function pushAlert(list, alert) {
  const dedupeKey = `${alert.netuid}:${alert.type}:${alert.window || "n"}:${Math.round(alert.value || 0)}`;
  if (list.some((a) => a.dedupeKey === dedupeKey && Date.now() - a.createdAt < 6 * 60 * 60 * 1000)) {
    return list;
  }
  list.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    read: false,
    dedupeKey,
    ...alert,
  });
  return list;
}

function pct(n) {
  return Number.isFinite(Number(n)) ? Number(n) : null;
}

/**
 * Compare a fresh scorecard against previous watchlist snapshot and emit alerts.
 * @param {object} scorecard
 * @param {object|null} previousItem
 * @param {object} settings
 */
export function evaluateAlertsForSubnet(scorecard, previousItem, settings = DEFAULT_ALERT_SETTINGS) {
  if (!settings.enabled) return [];
  const netuid = scorecard.netuid;
  const name = scorecard.name;
  const out = [];

  const prevOverall = previousItem?.overall;
  if (prevOverall != null && scorecard.overall != null) {
    const delta = scorecard.overall - prevOverall;
    if (Math.abs(delta) >= settings.scoreChange) {
      out.push({
        netuid,
        name,
        type: "score",
        tone: delta >= 0 ? "good" : "bad",
        title: `SN${netuid} score ${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta)}`,
        detail: `Overall moved from ${prevOverall} → ${scorecard.overall}`,
        value: delta,
      });
    }
  }

  const prevRisk = previousItem?.scores?.risk;
  const risk = scorecard.scores?.risk;
  if (prevRisk != null && risk != null) {
    const drop = prevRisk - risk;
    if (drop >= settings.riskDrop) {
      out.push({
        netuid,
        name,
        type: "risk",
        tone: "bad",
        title: `SN${netuid} risk safety ↓ ${drop}`,
        detail: `Risk score fell from ${prevRisk} → ${risk}`,
        value: -drop,
      });
    }
  }

  const c7 = Object.fromEntries((scorecard.changes7d || []).map((c) => [c.label, c.value]));
  const checks = [
    { key: "Stake", type: "stake", threshold: settings.stakeChangePct, label: "Stake" },
    { key: "Emissions", type: "emission", threshold: settings.emissionChangePct, label: "Emission" },
    { key: "Price", type: "price", threshold: settings.priceChangePct, label: "Price" },
    { key: "Miners", type: "miners", threshold: settings.minerChangePct, label: "Miner count" },
  ];

  for (const check of checks) {
    const value = pct(c7[check.key]);
    if (value == null) continue;
    if (Math.abs(value) >= check.threshold) {
      out.push({
        netuid,
        name,
        type: check.type,
        window: "7d",
        tone: value >= 0 ? "good" : "bad",
        title: `SN${netuid} ${check.label} ${value >= 0 ? "+" : ""}${value.toFixed(1)}% (7d)`,
        detail: `${check.label} changed significantly over 7 days`,
        value,
      });
    }
  }

  return out;
}

export async function appendAlerts(newAlerts) {
  if (!newAlerts?.length) return readAlerts();
  let list = await readAlerts();
  for (const alert of newAlerts) {
    list = pushAlert(list, alert);
  }
  return writeAlerts(list);
}

/**
 * Build a compact snapshot to store on the watchlist item.
 */
export function snapshotFromScorecard(scorecard) {
  return {
    overall: scorecard.overall,
    scores: scorecard.scores,
    changes7d: Object.fromEntries((scorecard.changes7d || []).map((c) => [c.label, c.value])),
    capturedAt: Date.now(),
  };
}
