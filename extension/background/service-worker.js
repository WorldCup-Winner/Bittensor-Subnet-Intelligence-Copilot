import { detectSubnet } from "../lib/detect.js";
import { collectSubnetMetrics } from "../lib/metrics.js";
import { calculateScorecard } from "../lib/scoring.js";
import { generateExplanation } from "../lib/ai.js";
import { compareSubnetsMatrix } from "../lib/compare.js";
import { buildHomeDashboard } from "../lib/home.js";
import {
  addToWatchlist,
  isWatched,
  listWatchlist,
  removeFromWatchlist,
  toggleWatchlist,
} from "../lib/watchlist.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
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
      return {
        ok: true,
        detection: detectSubnet(message.url, message.title),
      };

    case "GET_ACTIVE_SUBNET": {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return { ok: true, detection: null, tab: null };
      const detection = detectSubnet(tab.url, tab.title || "");
      return { ok: true, detection, tab: { id: tab.id, url: tab.url, title: tab.title } };
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

    case "WATCHLIST_LIST":
      return { ok: true, items: await listWatchlist() };

    case "WATCHLIST_STATUS":
      return { ok: true, watched: await isWatched(Number(message.netuid)) };

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
        ...(await toggleWatchlist(
          message.entry || {
            netuid: message.netuid,
            name: message.name,
            overall: message.overall,
            verdict: message.verdict,
            health: message.health,
          }
        )),
      };

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
  const watched = await isWatched(netuid);

  if (watched) {
    await addToWatchlist({
      netuid,
      name: scorecard.name,
      overall: scorecard.overall,
      verdict: scorecard.decision.label,
      health: scorecard.health.label,
    });
  }

  return {
    ok: true,
    analyzedAt: new Date().toISOString(),
    scorecard,
    explanation,
    watched,
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
  return { ok: true, dashboard };
}
