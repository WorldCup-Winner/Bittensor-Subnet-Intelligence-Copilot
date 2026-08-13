import { renderAreaChart } from "../lib/charts.js";

const statusEl = document.getElementById("status");
const modeText = document.getElementById("modeText");
const netuidInput = document.getElementById("netuidInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const detectHint = document.getElementById("detectHint");
const settingsBtn = document.getElementById("settingsBtn");
const watchBtn = document.getElementById("watchBtn");
const rerunBtn = document.getElementById("rerunBtn");
const openReportBtn = document.getElementById("openReportBtn");
const addCompareBtn = document.getElementById("addCompareBtn");
const exploreAnalyzeBtn = document.getElementById("exploreAnalyzeBtn");
const refreshHomeBtn = document.getElementById("refreshHomeBtn");
const refreshDailyBtn = document.getElementById("refreshDailyBtn");
const compareInput = document.getElementById("compareInput");
const compareAddBtn = document.getElementById("compareAddBtn");
const compareRunBtn = document.getElementById("compareRunBtn");
const compareClearBtn = document.getElementById("compareClearBtn");
const compareChips = document.getElementById("compareChips");
const compareResult = document.getElementById("compareResult");
const copilotInput = document.getElementById("copilotInput");
const copilotAskBtn = document.getElementById("copilotAskBtn");
const watchSort = document.getElementById("watchSort");
const watchItems = document.getElementById("watchItems");
const alertsList = document.getElementById("alertsList");

let currentNetuid = null;
let currentResult = null;
let watched = false;
let changeWindow = 7;
let compareSet = [];
let briefPages = [];
let briefPage = 0;
let chartKey = "miners";
let chartSeries = null;

const VIEW_GUIDES = {
  home: "Start → pick Top or Analyze a subnet",
  analyze: "Setup → Analyze → read Verdict",
  compare: "Setup → add 2+ subnets → Result",
  watch: "Saved list and alerts",
  report: "Full details by tab",
};

const VERDICT_HELP = {
  good: "Worth a closer look before spending more time.",
  warn: "Mixed signals — save it or compare with others.",
  bad: "Usually fine to skip unless you have a special reason.",
};

const LIST_LIMIT = 5;

function setStatus(text, kind = "loading") {
  statusEl.hidden = !text;
  statusEl.textContent = text || "";
  statusEl.classList.toggle("is-error", kind === "error");
  statusEl.classList.toggle("is-loading", kind === "loading");
}

function updateGuide(name) {
  const guide = document.getElementById("viewGuide");
  if (guide) guide.textContent = VIEW_GUIDES[name] || "";
}

function showPane(paneId) {
  const pane = document.getElementById(paneId);
  if (!pane) return;
  const view = pane.closest(".view");
  if (!view) return;
  view.querySelectorAll(".pane").forEach((el) => {
    el.hidden = el !== pane;
    el.classList.toggle("is-active", el === pane);
  });
  view.querySelectorAll(".subtab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.pane === paneId);
  });
}

function wireSubtabs() {
  document.querySelectorAll(".subtab").forEach((btn) => {
    btn.addEventListener("click", () => showPane(btn.dataset.pane));
  });
  document.querySelectorAll("[data-goto-pane]").forEach((btn) => {
    btn.addEventListener("click", () => showPane(btn.dataset.gotoPane));
  });
  document.querySelectorAll("[data-chip-tabs]").forEach((nav) => {
    nav.querySelectorAll("[data-chip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.chip;
        nav.querySelectorAll("[data-chip]").forEach((b) => b.classList.toggle("is-active", b === btn));
        const root = nav.parentElement;
        root.querySelectorAll("[data-chip-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.chipPanel !== key;
        });
      });
    });
  });
}

function syncAnalyzeResultPanes() {
  const has = Boolean(currentResult?.scorecard);
  document.getElementById("analyzeEmpty").hidden = has;
  document.getElementById("verdictGate").hidden = has;
  document.getElementById("verdictBody").hidden = !has;
}

function syncCompareEmpty() {
  const empty = document.getElementById("compareEmpty");
  const has = !compareResult.hidden;
  if (empty) empty.hidden = has;
}

function syncReportEmpty() {
  const empty = document.getElementById("reportEmpty");
  const has = Boolean(currentResult?.scorecard);
  const panes = ["report-summary", "report-network", "report-charts", "report-risks"];
  if (empty) {
    empty.hidden = has;
    empty.classList.toggle("is-active", !has);
  }
  panes.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!has) {
      el.hidden = true;
      el.classList.remove("is-active");
    }
  });
}

function showView(name) {
  document.querySelectorAll(".view").forEach((el) => {
    el.hidden = el.id !== `view-${name}`;
  });
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === name);
  });
  updateGuide(name);

  const defaults = {
    home: "home-welcome",
    analyze: currentResult ? "analyze-verdict" : "analyze-setup",
    compare: compareResult.hidden ? "compare-setup" : "compare-result",
    watch: "watch-list",
    report: currentResult ? "report-summary" : "reportEmpty",
  };
  if (defaults[name]) showPane(defaults[name]);

  if (name === "home") {
    loadHome();
    loadDailyReport(false);
  }
  if (name === "watch") loadWatchTab();
  if (name === "analyze") syncAnalyzeResultPanes();
  if (name === "compare") syncCompareEmpty();
  if (name === "report") {
    syncReportEmpty();
    if (currentResult) showPane("report-summary");
  }
}

function fmt(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function syncWatchButton() {
  watchBtn.textContent = watched ? "★ Saved" : "★ Save";
  watchBtn.classList.toggle("is-active", watched);
}

function renderChanges() {
  if (!currentResult?.scorecard) return;
  const sc = currentResult.scorecard;
  const list = document.getElementById("changesList");
  const bag = changeWindow === 30 ? sc.changes30d : sc.changes7d;
  list.innerHTML = "";
  (bag || []).slice(0, 5).forEach((c) => {
    const li = document.createElement("li");
    li.textContent = c.display;
    list.appendChild(li);
  });
  if (!bag?.length) list.innerHTML = `<li>No ${changeWindow}D changes</li>`;

  const sig = document.getElementById("significantList");
  sig.innerHTML = "";
  (sc.history?.significant || []).slice(0, 3).forEach((e) => {
    const li = document.createElement("li");
    li.textContent = e.display;
    sig.appendChild(li);
  });
}

function renderSingleChart() {
  const host = document.getElementById("charts");
  const tabs = document.getElementById("chartTabs");
  if (!chartSeries) {
    host.innerHTML = `<p class="empty">No chart data</p>`;
    tabs.innerHTML = "";
    return;
  }
  const labels = {
    miners: "Miners",
    validators: "Validators",
    emissions: "Emissions",
    stake: "Stake",
    liquidity: "Liquidity",
    prices: "Price",
  };
  const keys = ["miners", "validators", "emissions", "stake", "prices"].filter(
    (k) => Array.isArray(chartSeries[k]) && chartSeries[k].length > 1
  );
  if (!keys.includes(chartKey)) chartKey = keys[0] || "miners";

  tabs.innerHTML = "";
  keys.forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `chip-btn${key === chartKey ? " is-active" : ""}`;
    btn.textContent = labels[key] || key;
    btn.addEventListener("click", () => {
      chartKey = key;
      renderSingleChart();
    });
    tabs.appendChild(btn);
  });

  host.innerHTML = renderAreaChart(chartSeries[chartKey] || [], {
    label: labels[chartKey] || chartKey,
    width: 300,
    height: 140,
  });
}

async function explain(scoreKey) {
  if (!currentResult?.scorecard) return;
  showPane("analyze-ask");
  setStatus(`Explaining ${scoreKey}…`);
  const res = await chrome.runtime.sendMessage({
    type: "EXPLAIN_SCORE",
    scorecard: currentResult.scorecard,
    scoreKey,
  });
  if (!res?.ok) {
    setStatus(res?.error || "Explain failed", "error");
    return;
  }
  setStatus("");
  document.getElementById("copilotAnswer").textContent = res.text;
  document.getElementById("copilotMeta").textContent =
    `Explained ${scoreKey} · ${res.source === "openai" ? "AI" : "Local"}`;
}

function renderQuickReport(result) {
  const { scorecard, explanation, mode } = result;
  syncAnalyzeResultPanes();

  document.getElementById("subnetTitle").textContent = `SN${scorecard.netuid}`;
  document.getElementById("subnetName").textContent = scorecard.name;
  document.getElementById("overallScore").textContent = `${scorecard.overall}/100`;

  const health = document.getElementById("healthBadge");
  health.textContent = scorecard.health.label;
  health.className = `badge ${scorecard.health.tone}`;

  const chips = document.getElementById("chips");
  chips.innerHTML = "";
  [`Trend: ${scorecard.trend.label}`, `Risk: ${scorecard.risk.label}`, `Competition: ${scorecard.competition.label}`].forEach(
    (text) => {
      const el = document.createElement("span");
      el.className = "chip";
      el.textContent = text;
      chips.appendChild(el);
    }
  );

  const dims = document.getElementById("dims");
  dims.innerHTML = "";
  scorecard.dimensions.forEach((dim) => {
    const row = document.createElement("div");
    row.className = "dim dim--click";
    row.title = `Explain ${dim.label}`;
    row.innerHTML = `
      <div class="dim__label">${dim.icon} ${dim.label}</div>
      <div class="dim__score">${dim.score}</div>
      <div class="bar"><span style="width:${dim.score}%"></span></div>`;
    row.addEventListener("click", () => explain(dim.key));
    dims.appendChild(row);
  });

  document.getElementById("summaryText").textContent = explanation.text;
  document.getElementById("summaryMeta").textContent =
    explanation.source === "openai" ? "AI summary" : "Simple summary";

  const strengthsList = document.getElementById("strengthsList");
  const weaknessesList = document.getElementById("weaknessesList");
  strengthsList.innerHTML = "";
  weaknessesList.innerHTML = "";
  (scorecard.strengths || []).slice(0, 3).forEach((s) => {
    const li = document.createElement("li");
    li.textContent = `✓ ${s.text}`;
    strengthsList.appendChild(li);
  });
  (scorecard.weaknesses || []).slice(0, 3).forEach((w) => {
    const li = document.createElement("li");
    li.textContent = `! ${w.text}`;
    weaknessesList.appendChild(li);
  });

  chartSeries = scorecard.history?.series || null;
  renderChanges();
  renderSingleChart();

  document.getElementById("verdictText").textContent =
    `${scorecard.decision.emoji} ${scorecard.decision.label}`;
  document.getElementById("verdictHelp").textContent =
    VERDICT_HELP[scorecard.decision.tone] || "";

  modeText.textContent =
    mode === "taostats"
      ? "Live data"
      : mode === "demo_fallback"
        ? "Demo fallback · check Settings"
        : "Demo mode · Settings for live keys";

  renderFullReport(result);
  showPane("analyze-verdict");
}

function renderFullReport(result) {
  const sc = result.scorecard;
  const n = sc.network || {};
  const d = sc.development || {};
  syncReportEmpty();

  const summary = document.getElementById("report-summary");
  const network = document.getElementById("report-network");
  const chartsPane = document.getElementById("report-charts");
  const risks = document.getElementById("report-risks");

  summary.innerHTML = `
    <div class="report__head">
      <div>
        <h1>SN${sc.netuid} — ${escapeHtml(sc.name)}</h1>
        <p class="muted">${escapeHtml((sc.description || "Research summary").slice(0, 80))}</p>
      </div>
      <div class="score">
        <p class="score__label">Score</p>
        <p class="score__value">${sc.overall}/100</p>
      </div>
    </div>
    <p class="verdict">${sc.decision.emoji} ${sc.decision.label}</p>
    <p class="summary fit-text">${escapeHtml(result.explanation?.text || "")}</p>
    <div class="actions-row">
      <button type="button" class="btn btn--secondary" id="detailsBackAnalyze">Back to Analyze</button>
    </div>`;

  network.innerHTML = `
    <div class="kv">
      <span>Emission</span><span>${fmt(n.emission, 4)}</span>
      <span>Miners</span><span>${n.active_miners ?? "—"} / ${n.max_neurons ?? "—"}</span>
      <span>Validators</span><span>${n.active_validators ?? "—"}</span>
      <span>Reg. cost</span><span>${fmt(n.registration_cost, 3)} TAO</span>
      <span>Flow 7D</span><span>${fmt(n.net_flow_7_days, 3)}</span>
      <span>Price</span><span>${fmt(n.price, 6)}</span>
      <span>Liquidity</span><span>${fmt(n.liquidity_tao, 2)} TAO</span>
      <span>Commits 7D</span><span>${d.commits_7d ?? "—"}</span>
    </div>`;

  chartsPane.innerHTML = `
    <nav class="chip-tabs" id="reportChartTabs"></nav>
    <div id="reportCharts" class="charts single-chart"></div>`;

  risks.innerHTML = `
    <ul class="sw-list sw-list--weak fit-list">
      ${(sc.weaknesses || []).slice(0, 5).map((w) => `<li>${escapeHtml(w.text)}</li>`).join("")}
    </ul>
    <ul class="significant fit-list">
      ${(sc.watchSignals || []).slice(0, 4).map((s) => `<li>• ${escapeHtml(s)}</li>`).join("")}
    </ul>`;

  document.getElementById("detailsBackAnalyze")?.addEventListener("click", () => showView("analyze"));

  const series = sc.history?.series || {};
  const labels = {
    miners: "Miners",
    validators: "Validators",
    emissions: "Emissions",
    stake: "Stake",
    prices: "Price",
  };
  const keys = Object.keys(labels).filter((k) => Array.isArray(series[k]) && series[k].length > 1);
  const tabs = document.getElementById("reportChartTabs");
  const host = document.getElementById("reportCharts");
  let active = keys[0];
  const paint = () => {
    tabs.innerHTML = "";
    keys.forEach((key) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `chip-btn${key === active ? " is-active" : ""}`;
      btn.textContent = labels[key];
      btn.addEventListener("click", () => {
        active = key;
        paint();
      });
      tabs.appendChild(btn);
    });
    host.innerHTML = active
      ? renderAreaChart(series[active], { label: labels[active], width: 300, height: 150 })
      : `<p class="empty">No charts</p>`;
  };
  paint();
}

function renderCompareChips() {
  compareChips.innerHTML = "";
  compareSet.forEach((netuid) => {
    const chip = document.createElement("span");
    chip.className = "compare-chip";
    chip.innerHTML = `SN${netuid} <button type="button" aria-label="Remove">×</button>`;
    chip.querySelector("button").addEventListener("click", async () => {
      compareSet = compareSet.filter((n) => n !== netuid);
      await chrome.storage.session.set({ compareSet });
      renderCompareChips();
    });
    compareChips.appendChild(chip);
  });
}

function renderCompareMatrix(result) {
  compareResult.hidden = false;
  syncCompareEmpty();
  showPane("compare-result");
  const table = document.getElementById("compareTable");
  const netuids = result.matrix.netuids;
  const header = `<tr><th>Metric</th>${netuids.map((n) => `<th>SN${n}</th>`).join("")}</tr>`;
  const dimRows = result.matrix.dimensions
    .map((dim) => {
      const values = netuids.map((n) => dim.values[n]);
      const best = Math.max(...values.filter((v) => v != null));
      return `<tr><td>${dim.label}</td>${netuids
        .map((n) => `<td class="${dim.values[n] === best ? "best" : ""}">${dim.values[n] ?? "—"}</td>`)
        .join("")}</tr>`;
    })
    .join("");
  const bestOverall = Math.max(...netuids.map((n) => result.matrix.overall[n]));
  const overallRow = `<tr class="is-overall"><td>Overall</td>${netuids
    .map((n) => `<td class="${result.matrix.overall[n] === bestOverall ? "best" : ""}">${result.matrix.overall[n]}</td>`)
    .join("")}</tr>`;
  table.innerHTML = `<thead>${header}</thead><tbody>${dimRows}${overallRow}</tbody>`;
  document.getElementById("compareStrongest").textContent =
    `Winner: SN${result.strongest.netuid} — ${result.strongest.overall}/100`;
  document.getElementById("compareAi").textContent = result.explanation?.text || "";
  document.getElementById("compareAiMeta").textContent =
    result.explanation?.source === "openai" ? "AI comparison" : "Simple comparison";
}

function renderList(el, items, mapper) {
  el.innerHTML = "";
  if (!items?.length) {
    el.innerHTML = `<li class="empty">Nothing here yet</li>`;
    return;
  }
  items.slice(0, LIST_LIMIT).forEach((item) => el.appendChild(mapper(item)));
}

function renderHome(dashboard, alerts = []) {
  renderList(document.getElementById("homeOpportunities"), dashboard.topOpportunities, (item, idx) => {
    const li = document.createElement("li");
    const i = dashboard.topOpportunities.indexOf(item);
    li.innerHTML = `<span>${i + 1}. SN${item.netuid}</span><span>${item.overall}</span><button type="button">Analyze</button>`;
    li.querySelector("button").addEventListener("click", () => openAnalyze(item.netuid));
    return li;
  });

  renderList(document.getElementById("homeMomentum"), dashboard.biggestMomentum, (item) => {
    const delta =
      item.momentumDelta != null
        ? `${item.momentumDelta >= 0 ? "+" : ""}${Number(item.momentumDelta).toFixed(1)}%`
        : `mom ${item.momentum}`;
    const li = document.createElement("li");
    li.innerHTML = `<span>SN${item.netuid}</span><span>${delta}</span><button type="button">Open</button>`;
    li.querySelector("button").addEventListener("click", () => openAnalyze(item.netuid));
    return li;
  });

  const riskSource = (alerts || []).length
    ? alerts.slice(0, LIST_LIMIT).map((a) => ({ netuid: a.netuid, text: a.title }))
    : (dashboard.riskAlerts || []).map((r) => ({ netuid: r.netuid, text: r.text }));

  renderList(document.getElementById("homeRisks"), riskSource, (item) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>SN${item.netuid}</span><span>${escapeHtml(item.text)}</span><button type="button">Open</button>`;
    li.querySelector("button").addEventListener("click", () => openAnalyze(item.netuid));
    return li;
  });

  renderList(document.getElementById("homeWatchlist"), dashboard.watchlist, (item) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>SN${item.netuid}</span><span>${item.overall ?? "—"}</span><button type="button">Open</button>`;
    li.querySelector("button").addEventListener("click", () => openAnalyze(item.netuid));
    return li;
  });
}

function paginateBrief(text) {
  const clean = String(text || "").trim();
  if (!clean) return ["No brief yet."];
  const chunks = clean.split(/\n\n+/).filter(Boolean);
  if (chunks.length <= 1 && clean.length > 280) {
    const pages = [];
    for (let i = 0; i < clean.length; i += 260) pages.push(clean.slice(i, i + 260));
    return pages;
  }
  return chunks.length ? chunks : [clean];
}

function paintBrief() {
  const el = document.getElementById("dailyReportText");
  const meta = document.getElementById("dailyReportMeta");
  if (!briefPages.length) {
    el.textContent = "No brief yet.";
    return;
  }
  briefPage = Math.max(0, Math.min(briefPage, briefPages.length - 1));
  el.textContent = briefPages[briefPage];
  meta.textContent = `Page ${briefPage + 1}/${briefPages.length}`;
}

async function loadDailyReport(force) {
  document.getElementById("dailyReportText").textContent = force ? "Refreshing…" : "Loading…";
  try {
    const res = await chrome.runtime.sendMessage({ type: "DAILY_REPORT", force: Boolean(force) });
    if (!res?.ok) {
      briefPages = [res?.error || "Failed to load brief"];
      briefPage = 0;
      paintBrief();
      return;
    }
    briefPages = paginateBrief(res.report.text);
    briefPage = 0;
    paintBrief();
    document.getElementById("dailyReportMeta").textContent =
      `${res.report.date} · page ${briefPage + 1}/${briefPages.length}` +
      (res.report.cached ? " · cached" : "");
  } catch (err) {
    briefPages = [err instanceof Error ? err.message : String(err)];
    briefPage = 0;
    paintBrief();
  }
}

async function loadHome() {
  setStatus("Loading…");
  try {
    const res = await chrome.runtime.sendMessage({ type: "HOME_DASHBOARD" });
    if (!res?.ok) {
      setStatus(res?.error || "Home failed", "error");
      return;
    }
    setStatus("");
    renderHome(res.dashboard, res.alerts);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  }
}

async function loadWatchTab() {
  const listRes = await chrome.runtime.sendMessage({ type: "WATCHLIST_LIST" });
  const alertRes = await chrome.runtime.sendMessage({ type: "ALERTS_LIST" });
  if (listRes?.ok) {
    watchSort.innerHTML = "";
    (listRes.sorts || []).forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      if (s.id === listRes.prefs?.sort) opt.selected = true;
      watchSort.appendChild(opt);
    });
    renderWatchItems(listRes.items || []);
  }
  if (alertRes?.ok) renderAlerts(alertRes.alerts || []);
}

function renderWatchItems(items) {
  watchItems.innerHTML = "";
  if (!items.length) {
    watchItems.innerHTML = `<div class="empty-state compact"><p class="empty-state__title">Nothing saved</p><p class="empty-state__copy">Analyze a subnet, then tap Save.</p></div>`;
    return;
  }
  items.slice(0, 4).forEach((item) => {
    const card = document.createElement("div");
    card.className = "watch-card";
    card.innerHTML = `
      <div class="watch-card__top">
        <strong>SN${item.netuid}</strong>
        <span>${item.overall ?? "—"}/100</span>
      </div>
      <textarea rows="2" placeholder="Note…">${escapeHtml(item.note || "")}</textarea>
      <div class="actions-row">
        <button type="button" class="btn btn--ghost" data-open>Open</button>
        <button type="button" class="btn btn--secondary" data-save>Save</button>
        <button type="button" class="btn btn--ghost" data-remove>Remove</button>
      </div>`;
    card.querySelector("[data-open]").addEventListener("click", () => openAnalyze(item.netuid));
    card.querySelector("[data-save]").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({
        type: "WATCHLIST_NOTE",
        netuid: item.netuid,
        note: card.querySelector("textarea").value,
      });
      setStatus("Note saved");
      setTimeout(() => setStatus(""), 700);
    });
    card.querySelector("[data-remove]").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "WATCHLIST_REMOVE", netuid: item.netuid });
      if (currentNetuid === item.netuid) {
        watched = false;
        syncWatchButton();
      }
      loadWatchTab();
    });
    watchItems.appendChild(card);
  });
}

function renderAlerts(alerts) {
  alertsList.innerHTML = "";
  if (!alerts.length) {
    alertsList.innerHTML = `<li class="empty">No alerts yet</li>`;
    return;
  }
  alerts.slice(0, LIST_LIMIT).forEach((a) => {
    const li = document.createElement("li");
    li.className = a.read ? "" : "is-unread";
    li.innerHTML = `<span>${a.tone === "bad" ? "🔴" : "🟢"} ${escapeHtml(a.title)}</span><button type="button">Open</button>`;
    li.querySelector("button").addEventListener("click", () => openAnalyze(a.netuid));
    alertsList.appendChild(li);
  });
}

async function openAnalyze(netuid) {
  showView("analyze");
  showPane("analyze-setup");
  netuidInput.value = String(netuid);
  await runAnalyze(Number(netuid));
}

async function runAnalyze(netuid) {
  if (!Number.isInteger(netuid) || netuid < 0) {
    setStatus("Enter a subnet number like 34.", "error");
    return;
  }
  currentNetuid = netuid;
  analyzeBtn.disabled = true;
  setStatus(`Analyzing SN${netuid}…`);
  try {
    const result = await chrome.runtime.sendMessage({ type: "ANALYZE_SUBNET", netuid });
    if (!result?.ok) {
      setStatus(result?.error || "Analysis failed", "error");
      return;
    }
    setStatus("");
    currentResult = result;
    watched = Boolean(result.watched);
    syncWatchButton();
    renderQuickReport(result);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    analyzeBtn.disabled = false;
  }
}

async function askCopilot(question) {
  if (!currentResult?.scorecard) {
    setStatus("Analyze a subnet first.", "error");
    showPane("analyze-setup");
    return;
  }
  showPane("analyze-ask");
  const q = question || copilotInput.value;
  if (!String(q || "").trim()) return;
  setStatus("Thinking…");
  const res = await chrome.runtime.sendMessage({
    type: "ASK_COPILOT",
    scorecard: currentResult.scorecard,
    question: q,
  });
  if (!res?.ok) {
    setStatus(res?.error || "Ask failed", "error");
    return;
  }
  setStatus("");
  document.getElementById("copilotAnswer").textContent = res.text;
  document.getElementById("copilotMeta").textContent =
    res.source === "openai" ? "AI answer" : "Simple answer";
}

async function bootstrap() {
  wireSubtabs();
  const stored = await chrome.storage.local.get({ coachDismissed: false });
  const coach = document.getElementById("coach");
  if (coach) coach.hidden = Boolean(stored.coachDismissed);

  showView("home");

  const [active, session] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_SUBNET" }),
    chrome.storage.session.get(["pendingAnalyzeNetuid", "detectedNetuid", "compareSet"]),
  ]);

  if (Array.isArray(session.compareSet)) {
    compareSet = session.compareSet.map(Number).filter((n) => Number.isInteger(n));
    renderCompareChips();
  }

  const pending = session.pendingAnalyzeNetuid;
  const detected = active?.detection?.netuid ?? session.detectedNetuid ?? null;

  if (pending != null) {
    showView("analyze");
    netuidInput.value = String(pending);
    detectHint.textContent = `Found SN${pending} on this page`;
    await chrome.storage.session.remove("pendingAnalyzeNetuid");
    await runAnalyze(Number(pending));
    return;
  }
  if (detected != null) {
    netuidInput.value = String(detected);
    detectHint.textContent = `Detected SN${detected}. Tap Analyze.`;
  }
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

analyzeBtn.addEventListener("click", () => runAnalyze(Number(netuidInput.value)));
rerunBtn.addEventListener("click", () => currentNetuid != null && runAnalyze(currentNetuid));
exploreAnalyzeBtn.addEventListener("click", () => showView("analyze"));
document.getElementById("tryDemoBtn")?.addEventListener("click", () => openAnalyze(34));
document.getElementById("reportGoAnalyzeBtn")?.addEventListener("click", () => showView("analyze"));
document.getElementById("dismissCoachBtn")?.addEventListener("click", async () => {
  document.getElementById("coach").hidden = true;
  await chrome.storage.local.set({ coachDismissed: true });
});
document.querySelectorAll("[data-quick]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = Number(btn.dataset.quick);
    netuidInput.value = String(id);
    runAnalyze(id);
  });
});
refreshHomeBtn.addEventListener("click", () => loadHome());
refreshDailyBtn.addEventListener("click", () => loadDailyReport(true));
document.getElementById("briefPrevBtn")?.addEventListener("click", () => {
  briefPage -= 1;
  paintBrief();
});
document.getElementById("briefNextBtn")?.addEventListener("click", () => {
  briefPage += 1;
  paintBrief();
});
settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("overallExplain").addEventListener("click", () => explain("overall"));
openReportBtn.addEventListener("click", () => currentResult && showView("report"));

addCompareBtn.addEventListener("click", async () => {
  if (currentNetuid == null) return;
  if (!compareSet.includes(currentNetuid) && compareSet.length < 5) {
    compareSet.push(currentNetuid);
    await chrome.storage.session.set({ compareSet });
    renderCompareChips();
  }
  showView("compare");
});

watchBtn.addEventListener("click", async () => {
  if (!currentResult?.scorecard) return;
  const sc = currentResult.scorecard;
  const res = await chrome.runtime.sendMessage({
    type: "WATCHLIST_TOGGLE",
    entry: {
      netuid: sc.netuid,
      name: sc.name,
      overall: sc.overall,
      scores: sc.scores,
      verdict: sc.decision.label,
      health: sc.health.label,
      snapshot: { overall: sc.overall, scores: sc.scores, capturedAt: Date.now() },
    },
  });
  if (res?.ok) {
    watched = Boolean(res.watched);
    syncWatchButton();
  }
});

document.querySelectorAll("[data-window]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-window]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    changeWindow = Number(btn.dataset.window);
    renderChanges();
  });
});

copilotAskBtn.addEventListener("click", () => askCopilot());
copilotInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") askCopilot();
});
document.querySelectorAll("[data-q]").forEach((btn) => {
  btn.addEventListener("click", () => {
    copilotInput.value = btn.dataset.q;
    askCopilot(btn.dataset.q);
  });
});

compareAddBtn.addEventListener("click", async () => {
  const netuid = Number(compareInput.value);
  if (!Number.isInteger(netuid) || netuid < 0) {
    setStatus("Enter a subnet number like 64.", "error");
    return;
  }
  if (compareSet.includes(netuid) || compareSet.length >= 5) return;
  compareSet.push(netuid);
  compareInput.value = "";
  await chrome.storage.session.set({ compareSet });
  renderCompareChips();
});

compareClearBtn.addEventListener("click", async () => {
  compareSet = [];
  compareResult.hidden = true;
  syncCompareEmpty();
  await chrome.storage.session.set({ compareSet });
  renderCompareChips();
  showPane("compare-setup");
});

compareRunBtn.addEventListener("click", async () => {
  if (compareSet.length < 2) {
    setStatus("Add at least 2 subnets.", "error");
    return;
  }
  compareRunBtn.disabled = true;
  setStatus("Comparing…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "COMPARE_MATRIX", netuids: compareSet });
    if (!result?.ok) {
      setStatus(result?.error || "Compare failed", "error");
      return;
    }
    setStatus("");
    renderCompareMatrix(result);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    compareRunBtn.disabled = false;
  }
});

watchSort.addEventListener("change", async () => {
  const res = await chrome.runtime.sendMessage({ type: "WATCHLIST_SET_SORT", sort: watchSort.value });
  if (res?.ok) renderWatchItems(res.items || []);
});

document.getElementById("refreshAlertsBtn").addEventListener("click", async () => {
  setStatus("Checking alerts…");
  const res = await chrome.runtime.sendMessage({ type: "WATCHLIST_REFRESH_ALERTS" });
  if (!res?.ok) {
    setStatus(res?.error || "Scan failed", "error");
    return;
  }
  setStatus("");
  renderAlerts(res.alerts || []);
  showPane("watch-alerts");
});
document.getElementById("markAlertsReadBtn").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({ type: "ALERTS_MARK_READ" });
  if (res?.ok) renderAlerts(res.alerts || []);
});
document.getElementById("clearAlertsBtn").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({ type: "ALERTS_CLEAR" });
  if (res?.ok) renderAlerts(res.alerts || []);
});

netuidInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") analyzeBtn.click();
});
compareInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") compareAddBtn.click();
});

bootstrap();
