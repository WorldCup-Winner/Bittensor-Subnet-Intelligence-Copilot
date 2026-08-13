import { detectSubnet } from "../lib/detect.js";
import { collectSubnetMetrics } from "../lib/metrics.js";
import { calculateScorecard } from "../lib/scoring.js";
import {
  answerQuestion,
  explainScore,
  generateExplanation,
} from "../lib/ai.js";
import { compareSubnetsMatrix } from "../lib/compare.js";
import { buildHomeDashboard } from "../lib/home.js";
import { getDailyOpportunityReport } from "../lib/daily-report.js";
import {
  appendAlerts,
  evaluateAlertsForSubnet,
  getAlertSettings,
  listAlerts,
  markAlertsRead,
  clearAlerts,
  setAlertSettings,
  snapshotFromScorecard,
} from "../lib/alerts.js";
import {
  addToWatchlist,
  getWatchItem,
  getWatchlistPrefs,
  isWatched,
  listWatchlist,
  removeFromWatchlist,
  setWatchlistPrefs,
  toggleWatchlist,
  updateWatchNote,
  WATCHLIST_SORTS,
} from "../lib/watchlist.js";

const ALARM_NAME = "tao-scout-watchlist-refresh";

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 60 });
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 60 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    refreshWatchlistAlerts().catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) =>
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  return true;
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "DETECT_SUBNET":
      return { ok: true, detection: detectSubnet(message.url, message.title) };

    case "GET_ACTIVE_SUBNET": {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return { ok: true, detection: null, tab: null };
      return {
        ok: true,
        detection: detectSubnet(tab.url, tab.title || ""),
        tab: { id: tab.id, url: tab.url, title: tab.title },
      };
    }

    case "OPEN_SIDE_PANEL": {
      const tabId = sender?.tab?.id || message.tabId;
      if (tabId) await chrome.sidePanel.open({ tabId });
      return { ok: true };
    }

    case "ANALYZE_SUBNET":
      return analyzeSubnet(Number(message.netuid), Boolean(message.forceDemo));

    case "COMPARE_MATRIX":
      return compareMatrix(message.netuids || [], Boolean(message.forceDemo));

    case "HOME_DASHBOARD":
      return homeDashboard(Boolean(message.forceDemo));

    case "DAILY_REPORT":
      return dailyReport(Boolean(message.force), Boolean(message.forceDemo));

    case "EXPLAIN_SCORE":
      return explainScoreMsg(message.scorecard, message.scoreKey);

    case "ASK_COPILOT":
      return askCopilot(message.scorecard, message.question);

    case "WATCHLIST_LIST":
      return {
        ok: true,
        items: await listWatchlist(message.sort),
        prefs: await getWatchlistPrefs(),
        sorts: WATCHLIST_SORTS,
      };

    case "WATCHLIST_SET_SORT":
      return {
        ok: true,
        prefs: await setWatchlistPrefs({ sort: message.sort }),
        items: await listWatchlist(message.sort),
        sorts: WATCHLIST_SORTS,
      };

    case "WATCHLIST_NOTE":
      return {
        ok: true,
        item: await updateWatchNote(Number(message.netuid), message.note || ""),
        items: await listWatchlist(),
      };

    case "WATCHLIST_STATUS":
      return {
        ok: true,
        watched: await isWatched(Number(message.netuid)),
        item: await getWatchItem(Number(message.netuid)),
      };

    case "WATCHLIST_ADD":
      return {
        ok: true,
        item: await addToWatchlist(message.entry || { netuid: message.netuid }),
        items: await listWatchlist(),
      };

    case "WATCHLIST_REMOVE":
      return { ok: true, ...(await removeFromWatchlist(Number(message.netuid))) };

    case "WATCHLIST_TOGGLE":
      return {
        ok: true,
        ...(await toggleWatchlist(message.entry || { netuid: message.netuid })),
      };

    case "WATCHLIST_REFRESH_ALERTS":
      return refreshWatchlistAlerts();

    case "ALERTS_LIST":
      return {
        ok: true,
        alerts: await listAlerts(),
        settings: await getAlertSettings(),
      };

    case "ALERTS_MARK_READ":
      return { ok: true, alerts: await markAlertsRead() };

    case "ALERTS_CLEAR":
      return { ok: true, alerts: await clearAlerts() };

    case "ALERTS_SET_SETTINGS":
      return { ok: true, settings: await setAlertSettings(message.settings || {}) };

    case "GET_SETTINGS":
      return { ok: true, settings: await getSettings() };

    default:
      return { ok: false, error: `Unknown message: ${message?.type}` };
  }
}

async function getSettings() {
  return chrome.storage.sync.get({
    taostatsApiKey: "",
    openaiApiKey: "",
    preferDemo: false,
  });
}

function analysisOptions(settings, forceDemo) {
  return {
    taostatsApiKey: settings.preferDemo || forceDemo ? "" : settings.taostatsApiKey,
    forceDemo: settings.preferDemo || forceDemo || !settings.taostatsApiKey,
    openaiApiKey: settings.openaiApiKey || "",
  };
}

async function analyzeSubnet(netuid, forceDemo = false) {
  if (!Number.isInteger(netuid) || netuid < 0 || netuid > 1023) {
    return { ok: false, error: "Invalid netuid" };
  }

  const settings = await getSettings();
  const options = analysisOptions(settings, forceDemo);
  const metrics = await collectSubnetMetrics(netuid, options);
  const scorecard = calculateScorecard(metrics);
  const explanation = await generateExplanation(scorecard, {
    openaiApiKey: options.openaiApiKey,
  });

  const previous = await getWatchItem(netuid);
  const alertSettings = await getAlertSettings();
  const newAlerts = evaluateAlertsForSubnet(scorecard, previous, alertSettings);
  if (newAlerts.length) await appendAlerts(newAlerts);

  const watched = Boolean(previous);
  if (watched) {
    await addToWatchlist({
      netuid,
      name: scorecard.name,
      overall: scorecard.overall,
      scores: scorecard.scores,
      verdict: scorecard.decision.label,
      health: scorecard.health.label,
      note: previous.note || "",
      snapshot: snapshotFromScorecard(scorecard),
    });
  }

  return {
    ok: true,
    analyzedAt: new Date().toISOString(),
    scorecard,
    explanation,
    watched,
    newAlerts,
    mode: metrics.source,
  };
}

async function compareMatrix(netuids, forceDemo = false) {
  const settings = await getSettings();
  const options = analysisOptions(settings, forceDemo);
  try {
    const result = await compareSubnetsMatrix(netuids, options);
    return { ok: true, comparedAt: new Date().toISOString(), ...result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function homeDashboard(forceDemo = false) {
  const settings = await getSettings();
  const options = analysisOptions(settings, forceDemo);
  const dashboard = await buildHomeDashboard(options);
  const alerts = await listAlerts();
  return { ok: true, dashboard, alerts: alerts.slice(0, 8) };
}

async function dailyReport(force = false, forceDemo = false) {
  const settings = await getSettings();
  const options = analysisOptions(settings, forceDemo);
  const report = await getDailyOpportunityReport({ ...options, force });
  return { ok: true, report };
}

async function explainScoreMsg(scorecard, scoreKey) {
  if (!scorecard) return { ok: false, error: "Missing scorecard" };
  const settings = await getSettings();
  const result = await explainScore(scorecard, scoreKey || "overall", {
    openaiApiKey: settings.openaiApiKey || "",
  });
  return { ok: true, ...result, scoreKey: scoreKey || "overall" };
}

async function askCopilot(scorecard, question) {
  if (!scorecard) return { ok: false, error: "Analyze a subnet first" };
  const settings = await getSettings();
  const result = await answerQuestion(scorecard, question || "", {
    openaiApiKey: settings.openaiApiKey || "",
  });
  return { ok: true, ...result };
}

async function refreshWatchlistAlerts() {
  const settings = await getSettings();
  const options = analysisOptions(settings, false);
  const alertSettings = await getAlertSettings();
  if (!alertSettings.enabled) {
    return { ok: true, refreshed: 0, alerts: await listAlerts() };
  }

  const items = await listWatchlist();
  let refreshed = 0;
  const created = [];

  for (const item of items.slice(0, 10)) {
    try {
      const metrics = await collectSubnetMetrics(item.netuid, {
        ...options,
        skipHistory: false,
      });
      const scorecard = calculateScorecard(metrics);
      const newAlerts = evaluateAlertsForSubnet(scorecard, item, alertSettings);
      if (newAlerts.length) {
        await appendAlerts(newAlerts);
        created.push(...newAlerts);
      }
      await addToWatchlist({
        netuid: item.netuid,
        name: scorecard.name,
        overall: scorecard.overall,
        scores: scorecard.scores,
        verdict: scorecard.decision.label,
        health: scorecard.health.label,
        note: item.note || "",
        snapshot: snapshotFromScorecard(scorecard),
      });
      refreshed += 1;
    } catch {
      // continue
    }
  }

  return { ok: true, refreshed, created, alerts: await listAlerts() };
}
