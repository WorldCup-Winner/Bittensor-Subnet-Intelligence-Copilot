const statusEl = document.getElementById("status");
const modeText = document.getElementById("modeText");
const netuidInput = document.getElementById("netuidInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const detectHint = document.getElementById("detectHint");
const quickReport = document.getElementById("quickReport");
const settingsBtn = document.getElementById("settingsBtn");
const watchBtn = document.getElementById("watchBtn");
const rerunBtn = document.getElementById("rerunBtn");
const openReportBtn = document.getElementById("openReportBtn");
const addCompareBtn = document.getElementById("addCompareBtn");
const exploreAnalyzeBtn = document.getElementById("exploreAnalyzeBtn");
const refreshHomeBtn = document.getElementById("refreshHomeBtn");
const compareInput = document.getElementById("compareInput");
const compareAddBtn = document.getElementById("compareAddBtn");
const compareRunBtn = document.getElementById("compareRunBtn");
const compareClearBtn = document.getElementById("compareClearBtn");
const compareChips = document.getElementById("compareChips");
const compareResult = document.getElementById("compareResult");
const fullReport = document.getElementById("fullReport");

let currentNetuid = null;
let currentResult = null;
let watched = false;
let changeWindow = 7;
let compareSet = [];

function setStatus(text, kind = "loading") {
  statusEl.hidden = !text;
  statusEl.textContent = text || "";
  statusEl.classList.toggle("is-error", kind === "error");
  statusEl.classList.toggle("is-loading", kind === "loading");
}

function showView(name) {
  document.querySelectorAll(".view").forEach((el) => {
    el.hidden = el.id !== `view-${name}`;
  });
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === name);
  });
}

function sparklineSvg(values) {
  const nums = (values || []).filter((v) => Number.isFinite(Number(v))).map(Number);
  if (nums.length < 2) {
    return `<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none"><path d="M0 14 H100" /></svg>`;
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const coords = nums.map((v, i) => {
    const x = (i / (nums.length - 1)) * 100;
    const y = 24 - ((v - min) / span) * 20;
    return [x, y];
  });
  const d = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)} ${c[1].toFixed(1)}`)
    .join(" ");
  const last = coords[coords.length - 1];
  return `<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none">
    <path d="${d}" />
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.2" />
  </svg>`;
}

function fmt(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

function syncWatchButton() {
  watchBtn.textContent = watched ? "Watching" : "Watch";
  watchBtn.classList.toggle("is-active", watched);
}

function renderChanges() {
  if (!currentResult?.scorecard) return;
  const sc = currentResult.scorecard;
  const list = document.getElementById("changesList");
  const bag = changeWindow === 30 ? sc.changes30d : sc.changes7d;
  list.innerHTML = "";
  if (!bag?.length) {
    list.innerHTML = `<li>No ${changeWindow}D deltas available.</li>`;
  } else {
    bag.forEach((c) => {
      const li = document.createElement("li");
      li.textContent = c.display;
      list.appendChild(li);
    });
  }

  const sig = document.getElementById("significantList");
  sig.innerHTML = "";
  (sc.history?.significant || []).forEach((e) => {
    const li = document.createElement("li");
    li.textContent = e.display;
    sig.appendChild(li);
  });
}

function renderTrends(history) {
  const trends = document.getElementById("trends");
  trends.innerHTML = "";
  if (!history?.series) return;
  [
    ["Miners", history.series.miners],
    ["Validators", history.series.validators],
    ["Emissions", history.series.emissions],
    ["Stake/Liq", history.series.stake || history.series.liquidity],
    ["Price", history.series.prices],
  ]
    .filter(([, series]) => Array.isArray(series) && series.length > 1)
    .forEach(([label, series]) => {
      const row = document.createElement("div");
      row.className = "trend";
      row.innerHTML = `<div class="trend__label">${label}</div>${sparklineSvg(series)}`;
      trends.appendChild(row);
    });
}

function renderQuickReport(result) {
  const { scorecard, explanation, mode } = result;
  quickReport.hidden = false;

  document.getElementById("subnetTitle").textContent = `SN${scorecard.netuid}`;
  document.getElementById("subnetName").textContent = scorecard.name;
  document.getElementById("overallScore").textContent = `${scorecard.overall} / 100`;

  const health = document.getElementById("healthBadge");
  health.textContent = scorecard.health.label;
  health.className = `badge ${scorecard.health.tone}`;

  const chips = document.getElementById("chips");
  chips.innerHTML = "";
  [
    `${scorecard.health.tone === "good" ? "🟢" : scorecard.health.tone === "warn" ? "🟡" : "🔴"} ${scorecard.health.label}`,
    `📈 ${scorecard.trend.label}`,
    `⚠️ ${scorecard.risk.label}`,
    `⛏ ${scorecard.competition.label}`,
  ].forEach((text) => {
    const el = document.createElement("span");
    el.className = "chip";
    el.textContent = text;
    chips.appendChild(el);
  });

  const dims = document.getElementById("dims");
  dims.innerHTML = "";
  scorecard.dimensions.forEach((dim) => {
    const row = document.createElement("div");
    row.className = "dim";
    row.innerHTML = `
      <div class="dim__label">${dim.icon} ${dim.label}</div>
      <div class="dim__score">${dim.score}</div>
      <div class="bar"><span style="width:${dim.score}%"></span></div>
    `;
    dims.appendChild(row);
  });

  document.getElementById("summaryText").textContent = explanation.text;
  document.getElementById("summaryMeta").textContent =
    explanation.source === "openai" ? "Generated with OpenAI" : "Local summary";

  const strengthsList = document.getElementById("strengthsList");
  const weaknessesList = document.getElementById("weaknessesList");
  strengthsList.innerHTML = "";
  weaknessesList.innerHTML = "";
  (scorecard.strengths || []).forEach((s) => {
    const li = document.createElement("li");
    li.textContent = `✓ ${s.text}`;
    strengthsList.appendChild(li);
  });
  (scorecard.weaknesses || []).forEach((w) => {
    const li = document.createElement("li");
    li.textContent = `! ${w.text}`;
    weaknessesList.appendChild(li);
  });

  renderChanges();
  renderTrends(scorecard.history);
  document.getElementById("verdictText").textContent =
    `${scorecard.decision.emoji} ${scorecard.decision.label}`;

  modeText.textContent =
    mode === "taostats"
      ? "Live data · Taostats"
      : mode === "demo_fallback"
        ? `Demo fallback · ${scorecard.warning || "API error"}`
        : "Demo data · add Taostats key in Settings";

  requestAnimationFrame(() => {
    dims.querySelectorAll(".bar > span").forEach((el) => {
      const width = el.style.width;
      el.style.width = "0%";
      requestAnimationFrame(() => {
        el.style.width = width;
      });
    });
  });

  renderFullReport(result);
}

function renderFullReport(result) {
  const sc = result.scorecard;
  const n = sc.network || {};
  const d = sc.development || {};

  fullReport.innerHTML = `
    <div class="report__head">
      <div>
        <h1>SN${sc.netuid} — ${sc.name}</h1>
        <p class="muted">${sc.description || "Full subnet research report"}</p>
      </div>
      <div class="score">
        <p class="score__label">Overall</p>
        <p class="score__value">${sc.overall}/100</p>
        <p class="badge ${sc.health.tone}">${sc.health.label}</p>
      </div>
    </div>

    <div class="dims" style="margin-top:12px">
      ${sc.dimensions
        .map(
          (dim) => `
        <div class="dim">
          <div class="dim__label">${dim.icon} ${dim.label}</div>
          <div class="dim__score">${dim.score}</div>
          <div class="bar"><span style="width:${dim.score}%"></span></div>
        </div>`
        )
        .join("")}
    </div>

    <article class="block">
      <h2>Trend</h2>
      <div class="kv">
        <span>7 Days</span><span>${summarizeWindow(sc.changes7d)}</span>
        <span>30 Days</span><span>${summarizeWindow(sc.changes30d)}</span>
      </div>
    </article>

    <article class="block">
      <h2>Network</h2>
      <div class="kv">
        <span>Emission</span><span>${fmt(n.emission, 4)}</span>
        <span>Miners</span><span>${n.active_miners ?? "—"} / ${n.max_neurons ?? "—"}</span>
        <span>Validators</span><span>${n.active_validators ?? "—"}</span>
        <span>Reg. cost</span><span>${fmt(n.registration_cost, 3)} TAO</span>
        <span>Flow 7D</span><span>${fmt(n.net_flow_7_days, 3)}</span>
        <span>Flow 30D</span><span>${fmt(n.net_flow_30_days, 3)}</span>
        <span>Price</span><span>${fmt(n.price, 6)}</span>
        <span>Liquidity</span><span>${fmt(n.liquidity_tao, 2)} TAO</span>
        <span>Market cap</span><span>${fmt(n.market_cap_tao, 2)} TAO</span>
      </div>
    </article>

    <article class="block">
      <h2>Development</h2>
      <div class="kv">
        <span>Commits 7D</span><span>${d.commits_7d ?? "—"}</span>
        <span>Contributors</span><span>${d.contributors ?? "—"}</span>
        <span>Open PRs</span><span>${d.open_prs ?? "—"}</span>
        <span>Last commit</span><span>${d.last_commit_days_ago != null ? `${d.last_commit_days_ago}d ago` : "—"}</span>
        <span>GitHub</span><span>${sc.identity?.github || "—"}</span>
      </div>
    </article>

    <article class="block">
      <h2>AI Analysis</h2>
      <p class="summary">${escapeHtml(result.explanation?.text || "")}</p>
    </article>

    <article class="block">
      <h2>Risks</h2>
      <ul class="sw-list sw-list--weak">
        ${(sc.weaknesses || []).map((w) => `<li>${escapeHtml(w.text)}</li>`).join("")}
      </ul>
    </article>

    <article class="block">
      <h2>What to Watch</h2>
      <ul class="significant">
        ${(sc.watchSignals || []).map((s) => `<li>• ${escapeHtml(s)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function summarizeWindow(changes) {
  if (!changes?.length) return "—";
  const avg =
    changes.reduce((sum, c) => sum + (Number(c.value) || 0), 0) / changes.length;
  return `${avg >= 0 ? "↑" : "↓"} ${Math.abs(avg).toFixed(1)}% avg`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderCompareChips() {
  compareChips.innerHTML = "";
  compareSet.forEach((netuid) => {
    const chip = document.createElement("span");
    chip.className = "compare-chip";
    chip.innerHTML = `SN${netuid} <button type="button" aria-label="Remove">×</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      compareSet = compareSet.filter((n) => n !== netuid);
      renderCompareChips();
    });
    compareChips.appendChild(chip);
  });
}

function renderCompareMatrix(result) {
  compareResult.hidden = false;
  const table = document.getElementById("compareTable");
  const netuids = result.matrix.netuids;
  const header = `<tr><th>Metric</th>${netuids
    .map((n) => `<th>SN${n}</th>`)
    .join("")}</tr>`;

  const dimRows = result.matrix.dimensions
    .map((dim) => {
      const values = netuids.map((n) => dim.values[n]);
      const best = Math.max(...values.filter((v) => v != null));
      // For competition, lower can be "better" for new miners — still highlight max as hottest competition
      return `<tr>
        <td>${dim.label}</td>
        ${netuids
          .map((n) => {
            const v = dim.values[n];
            const cls = v === best ? "best" : "";
            return `<td class="${cls}">${v ?? "—"}</td>`;
          })
          .join("")}
      </tr>`;
    })
    .join("");

  const overallVals = netuids.map((n) => result.matrix.overall[n]);
  const bestOverall = Math.max(...overallVals);
  const overallRow = `<tr class="is-overall"><td>Overall</td>${netuids
    .map((n) => {
      const v = result.matrix.overall[n];
      return `<td class="${v === bestOverall ? "best" : ""}">${v}</td>`;
    })
    .join("")}</tr>`;

  table.innerHTML = `<thead>${header}</thead><tbody>${dimRows}${overallRow}</tbody>`;

  document.getElementById("compareStrongest").textContent =
    `🟢 SN${result.strongest.netuid} (${result.strongest.name}) — ${result.strongest.overall}/100`;
  document.getElementById("compareAi").textContent = result.explanation?.text || "";
  document.getElementById("compareAiMeta").textContent =
    result.explanation?.source === "openai" ? "AI comparison" : "Local comparison";
}

function renderHome(dashboard) {
  const opp = document.getElementById("homeOpportunities");
  const mom = document.getElementById("homeMomentum");
  const risks = document.getElementById("homeRisks");
  const watch = document.getElementById("homeWatchlist");

  opp.innerHTML = "";
  (dashboard.topOpportunities || []).forEach((item, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${idx + 1}. SN${item.netuid} · ${item.name}</span>
      <span>${item.overall} ${item.health?.tone === "good" ? "🟢" : item.health?.tone === "warn" ? "🟡" : "🔴"}</span>
      <button type="button">Open</button>`;
    li.querySelector("button").addEventListener("click", () => openAnalyze(item.netuid));
    opp.appendChild(li);
  });
  if (!dashboard.topOpportunities?.length) {
    opp.innerHTML = `<li class="empty">No opportunities yet</li>`;
  }

  mom.innerHTML = "";
  (dashboard.biggestMomentum || []).forEach((item) => {
    const li = document.createElement("li");
    const delta =
      item.momentumDelta != null
        ? `${item.momentumDelta >= 0 ? "+" : ""}${Number(item.momentumDelta).toFixed(1)}%`
        : `mom ${item.momentum}`;
    li.innerHTML = `<span>SN${item.netuid}</span><span>${delta}</span>
      <button type="button">Open</button>`;
    li.querySelector("button").addEventListener("click", () => openAnalyze(item.netuid));
    mom.appendChild(li);
  });
  if (!dashboard.biggestMomentum?.length) {
    mom.innerHTML = `<li class="empty">No momentum board yet</li>`;
  }

  risks.innerHTML = "";
  (dashboard.riskAlerts || []).forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>SN${item.netuid}</span><span>${item.text}</span>
      <button type="button">Open</button>`;
    li.querySelector("button").addEventListener("click", () => openAnalyze(item.netuid));
    risks.appendChild(li);
  });
  if (!dashboard.riskAlerts?.length) {
    risks.innerHTML = `<li class="empty">No risk alerts in scan</li>`;
  }

  watch.innerHTML = "";
  (dashboard.watchlist || []).forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>SN${item.netuid} · ${item.name || ""}</span>
      <span>${item.overall ?? "—"}</span>
      <button type="button">Open</button>`;
    li.querySelector("button").addEventListener("click", () => openAnalyze(item.netuid));
    watch.appendChild(li);
  });
  if (!dashboard.watchlist?.length) {
    watch.innerHTML = `<li class="empty">Watchlist empty — star a subnet after analyze</li>`;
  }

  modeText.textContent =
    dashboard.source === "taostats"
      ? "Home · live scan"
      : "Home · demo scan (add Taostats key for live)";
}

async function loadHome() {
  setStatus("Loading home dashboard…");
  try {
    const res = await chrome.runtime.sendMessage({ type: "HOME_DASHBOARD" });
    if (!res?.ok) {
      setStatus(res?.error || "Home failed", "error");
      return;
    }
    setStatus("");
    renderHome(res.dashboard);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  }
}

async function openAnalyze(netuid) {
  showView("analyze");
  netuidInput.value = String(netuid);
  await runAnalyze(Number(netuid));
}

async function runAnalyze(netuid) {
  if (!Number.isInteger(netuid) || netuid < 0) {
    setStatus("Enter a valid subnet netuid.", "error");
    return;
  }
  currentNetuid = netuid;
  analyzeBtn.disabled = true;
  quickReport.hidden = true;
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

async function bootstrap() {
  showView("home");
  loadHome();

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
    detectHint.textContent = `Analyzing SN${pending} from page…`;
    await chrome.storage.session.remove("pendingAnalyzeNetuid");
    await runAnalyze(Number(pending));
    return;
  }

  if (detected != null) {
    netuidInput.value = String(detected);
    detectHint.textContent = `Detected SN${detected} on this tab.`;
  }
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    showView(btn.dataset.view);
    if (btn.dataset.view === "home") loadHome();
  });
});

analyzeBtn.addEventListener("click", () => runAnalyze(Number(netuidInput.value)));
rerunBtn.addEventListener("click", () => currentNetuid != null && runAnalyze(currentNetuid));
exploreAnalyzeBtn.addEventListener("click", () => showView("analyze"));
refreshHomeBtn.addEventListener("click", () => loadHome());
settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

openReportBtn.addEventListener("click", () => {
  if (!currentResult) return;
  showView("report");
});

addCompareBtn.addEventListener("click", async () => {
  if (currentNetuid == null) return;
  if (!compareSet.includes(currentNetuid)) {
    if (compareSet.length >= 5) {
      setStatus("Compare supports up to 5 subnets.", "error");
      return;
    }
    compareSet.push(currentNetuid);
    await chrome.storage.session.set({ compareSet });
    renderCompareChips();
  }
  showView("compare");
  setStatus("");
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
      verdict: sc.decision.label,
      health: sc.health.label,
    },
  });
  if (res?.ok) {
    watched = Boolean(res.watched);
    syncWatchButton();
  }
});

document.querySelectorAll(".chip-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".chip-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    changeWindow = Number(btn.dataset.window);
    renderChanges();
  });
});

compareAddBtn.addEventListener("click", async () => {
  const netuid = Number(compareInput.value);
  if (!Number.isInteger(netuid) || netuid < 0) {
    setStatus("Enter a valid netuid to add.", "error");
    return;
  }
  if (compareSet.includes(netuid)) return;
  if (compareSet.length >= 5) {
    setStatus("Compare supports up to 5 subnets.", "error");
    return;
  }
  compareSet.push(netuid);
  compareInput.value = "";
  await chrome.storage.session.set({ compareSet });
  renderCompareChips();
  setStatus("");
});

compareClearBtn.addEventListener("click", async () => {
  compareSet = [];
  compareResult.hidden = true;
  await chrome.storage.session.set({ compareSet });
  renderCompareChips();
});

compareRunBtn.addEventListener("click", async () => {
  if (compareSet.length < 2) {
    setStatus("Add at least 2 subnets to compare.", "error");
    return;
  }
  compareRunBtn.disabled = true;
  setStatus(`Comparing ${compareSet.map((n) => `SN${n}`).join(", ")}…`);
  try {
    const result = await chrome.runtime.sendMessage({
      type: "COMPARE_MATRIX",
      netuids: compareSet,
    });
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

netuidInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") analyzeBtn.click();
});
compareInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") compareAddBtn.click();
});

bootstrap();
