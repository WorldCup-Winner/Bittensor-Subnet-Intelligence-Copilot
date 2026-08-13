/**
 * Daily opportunity report for Home (V1).
 */

import { buildHomeDashboard } from "./home.js";
import { listAlerts } from "./alerts.js";
import { listWatchlist } from "./watchlist.js";

const REPORT_KEY = "dailyOpportunityReport";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function localDailyNarrative(dashboard, alerts, watchlist) {
  const top = dashboard.topOpportunities?.[0];
  const mom = dashboard.biggestMomentum?.[0];
  const risk = dashboard.riskAlerts?.[0];
  const unread = alerts.filter((a) => !a.read).slice(0, 3);

  const lines = [];
  lines.push(`Daily subnet brief · ${todayKey()}`);

  if (top) {
    lines.push(
      `Top opportunity: SN${top.netuid} (${top.name}) at ${top.overall}/100 — ${top.decision?.label || "review"}.`
    );
  } else {
    lines.push("No clear top opportunity in today's scan.");
  }

  if (mom) {
    const delta =
      mom.momentumDelta != null
        ? `${mom.momentumDelta >= 0 ? "+" : ""}${Number(mom.momentumDelta).toFixed(1)}%`
        : `momentum ${mom.momentum}`;
    lines.push(`Momentum leader: SN${mom.netuid} (${delta}).`);
  }

  if (risk) {
    lines.push(`Risk watch: SN${risk.netuid} — ${risk.text}.`);
  }

  if (watchlist.length) {
    lines.push(
      `Watchlist: ${watchlist.length} subnet${watchlist.length === 1 ? "" : "s"} monitored` +
        (watchlist[0] ? `; latest focus SN${watchlist[0].netuid}.` : ".")
    );
  } else {
    lines.push("Watchlist empty — star subnets after Analyze to personalize tomorrow's brief.");
  }

  if (unread.length) {
    lines.push(`Fresh alerts: ${unread.map((a) => a.title).join(" · ")}`);
  }

  lines.push("Suggested actions: open the top opportunity, compare it with #2, and check any risk alerts.");
  return lines.join("\n\n");
}

/**
 * @param {{ taostatsApiKey?: string, forceDemo?: boolean, openaiApiKey?: string, force?: boolean }} options
 */
export async function getDailyOpportunityReport(options = {}) {
  const stored = await chrome.storage.local.get({ [REPORT_KEY]: null });
  const cached = stored[REPORT_KEY];
  if (!options.force && cached?.date === todayKey() && cached?.text) {
    return { ...cached, cached: true };
  }

  const dashboard = await buildHomeDashboard(options);
  const [alerts, watchlist] = await Promise.all([listAlerts(), listWatchlist()]);

  let text = localDailyNarrative(dashboard, alerts, watchlist);
  let source = "local";

  if (options.openaiApiKey) {
    try {
      const prompt = `Write a tight daily Bittensor research brief (5-7 short paragraphs/lines).
Use only this data. No hype. End with 3 concrete actions.

DATA:
${text}

Top board JSON:
${JSON.stringify(dashboard.topOpportunities?.slice(0, 5) || [])}
Momentum JSON:
${JSON.stringify(dashboard.biggestMomentum?.slice(0, 5) || [])}
Risks JSON:
${JSON.stringify(dashboard.riskAlerts?.slice(0, 5) || [])}`;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.4,
          max_tokens: 350,
          messages: [
            {
              role: "system",
              content: "You are TAO Scout writing a daily subnet opportunity report.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const aiText = data?.choices?.[0]?.message?.content?.trim();
        if (aiText) {
          text = aiText;
          source = "openai";
        }
      }
    } catch {
      // keep local
    }
  }

  const report = {
    date: todayKey(),
    generatedAt: new Date().toISOString(),
    text,
    source,
    highlights: {
      top: dashboard.topOpportunities?.[0] || null,
      momentum: dashboard.biggestMomentum?.[0] || null,
      risk: dashboard.riskAlerts?.[0] || null,
    },
    dashboard,
  };

  await chrome.storage.local.set({ [REPORT_KEY]: report });
  return { ...report, cached: false };
}
