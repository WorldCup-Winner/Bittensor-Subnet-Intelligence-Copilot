/**
 * AI explanations: summary, strengths framing, comparison narrative.
 */

function dimMap(scorecard) {
  return Object.fromEntries((scorecard.dimensions || []).map((d) => [d.key, d.score]));
}

export function localSummary(scorecard) {
  const sn = `SN${scorecard.netuid}`;
  const name = scorecard.name;
  const strengths = (scorecard.strengths || []).slice(0, 2).map((s) => s.text);
  const weaknesses = (scorecard.weaknesses || []).slice(0, 2).map((w) => w.text);

  const strengthText = strengths.length
    ? `${sn} (${name}) strengths: ${strengths.join("; ")}.`
    : `${sn} (${name}) looks middling across core signals.`;
  const concernText = weaknesses.length
    ? ` Watch-outs: ${weaknesses.join("; ")}.`
    : " No major red flags in the MVP scorecard.";
  const verdictLine =
    scorecard.decision.tone === "good"
      ? " Worth a deeper research pass."
      : scorecard.decision.tone === "warn"
        ? " Park it on a watchlist before allocating time or capital."
        : " Probably not worth deep research right now unless you have a specific thesis.";

  return `${strengthText}${concernText}${verdictLine}`;
}

export function localComparison(scorecards) {
  if (!scorecards?.length) return "No subnets to compare.";
  const ranked = [...scorecards].sort((a, b) => b.overall - a.overall);
  const top = ranked[0];
  const second = ranked[1];

  const lines = [
    `Strongest overall: SN${top.netuid} (${top.name}) at ${top.overall}/100.`,
  ];

  if (second) {
    const gap = top.overall - second.overall;
    lines.push(
      gap === 0
        ? `SN${second.netuid} ties closely at ${second.overall}/100.`
        : `Next is SN${second.netuid} at ${second.overall}/100 (${gap} pts behind).`
    );
  }

  const dimKeys = ["health", "momentum", "development", "market", "risk"];
  const leaders = dimKeys
    .map((key) => {
      const best = [...scorecards].sort(
        (a, b) => (b.scores?.[key] ?? 0) - (a.scores?.[key] ?? 0)
      )[0];
      return best ? `${key}: SN${best.netuid} (${best.scores[key]})` : null;
    })
    .filter(Boolean);

  lines.push(`Dimension leaders — ${leaders.join("; ")}.`);

  const riskiest = [...scorecards].sort(
    (a, b) => (a.scores?.risk ?? 0) - (b.scores?.risk ?? 0)
  )[0];
  if (riskiest) {
    lines.push(
      `Softest risk safety: SN${riskiest.netuid} (${riskiest.scores.risk}/100).`
    );
  }

  return lines.join(" ");
}

function buildSummaryPrompt(scorecard) {
  const dims = scorecard.dimensions.map((d) => `- ${d.label}: ${d.score}/100`).join("\n");
  const changes7 = (scorecard.changes7d || []).map((c) => c.display).join("\n") || "n/a";
  const changes30 = (scorecard.changes30d || []).map((c) => c.display).join("\n") || "n/a";
  const strengths = (scorecard.strengths || []).map((s) => s.text).join("; ");
  const weaknesses = (scorecard.weaknesses || []).map((w) => w.text).join("; ");

  return `You are TAO Scout, a Bittensor subnet research copilot.
Write a concise 3-5 sentence analysis for researchers.
Be concrete, avoid hype, mention main opportunity and main risk.
Do not invent metrics.

Subnet: SN${scorecard.netuid} (${scorecard.name})
Overall: ${scorecard.overall}/100 (${scorecard.health.label})
Trend: ${scorecard.trend.label}
Risk: ${scorecard.risk.label}
Competition: ${scorecard.competition.label}
Verdict: ${scorecard.decision.label}

Scores:
${dims}

Strengths: ${strengths || "n/a"}
Weaknesses: ${weaknesses || "n/a"}

7D changes:
${changes7}

30D changes:
${changes30}

Data source: ${scorecard.source}`;
}

function buildComparePrompt(scorecards) {
  const blocks = scorecards
    .map((sc) => {
      const dims = dimMap(sc);
      return `SN${sc.netuid} (${sc.name}) overall ${sc.overall}
Health ${dims.health}, Momentum ${dims.momentum}, Development ${dims.development}, Market ${dims.market}, Risk ${dims.risk}, Competition ${dims.competition}`;
    })
    .join("\n\n");

  return `You are TAO Scout. Compare these Bittensor subnets in 4-6 sentences.
Say which is stronger overall and why, call out 1-2 dimension winners, and one risk.
Do not invent numbers.

${blocks}`;
}

async function openaiChat(apiKey, userPrompt, maxTokens = 260) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: maxTokens,
      messages: [
        {
          role: "system",
          content:
            "You write short, sharp Bittensor subnet research briefs. No markdown headings.",
        },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty OpenAI response");
  return text;
}

/**
 * @param {object} scorecard
 * @param {{ openaiApiKey?: string }} options
 */
export async function generateExplanation(scorecard, options = {}) {
  const { openaiApiKey } = options;
  if (!openaiApiKey) {
    return { source: "local", text: localSummary(scorecard) };
  }
  try {
    const text = await openaiChat(openaiApiKey, buildSummaryPrompt(scorecard));
    return { source: "openai", text };
  } catch (err) {
    return {
      source: "local_fallback",
      text: localSummary(scorecard),
      warning: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {object[]} scorecards
 * @param {{ openaiApiKey?: string }} options
 */
export async function generateComparison(scorecards, options = {}) {
  const { openaiApiKey } = options;
  if (!openaiApiKey) {
    return { source: "local", text: localComparison(scorecards) };
  }
  try {
    const text = await openaiChat(openaiApiKey, buildComparePrompt(scorecards), 320);
    return { source: "openai", text };
  } catch (err) {
    return {
      source: "local_fallback",
      text: localComparison(scorecards),
      warning: err instanceof Error ? err.message : String(err),
    };
  }
}

const SCORE_EXPLAINERS = {
  health:
    "Health blends miner fill, validator coverage, and whether registration is open. Higher means the network looks populated and operationally intact.",
  momentum:
    "Momentum tracks whether the subnet is improving: stake/capital flow, price direction, and recent miner activity changes.",
  development:
    "Development reflects builder footprint — GitHub/commits when available, otherwise identity/description signals as a weaker proxy.",
  market:
    "Market scores liquidity, volume, market-cap depth, and price activity. Higher usually means easier to enter/exit and more traded interest.",
  risk:
    "Risk is inverted for safety: higher = safer. It penalizes thin validators, outflows, sharp price swings, and emission drops.",
  competition:
    "Competition estimates how hard it is for new miners: occupancy vs max neurons, registration cost, and whether registration is closed. Higher = more competitive.",
  overall:
    "Overall is a weighted blend of Health, Momentum, Development, Market, Risk safety, and an inverted Competition term.",
};

export function localExplainScore(scorecard, scoreKey = "overall") {
  const key = String(scoreKey || "overall");
  const value =
    key === "overall" ? scorecard.overall : scorecard.scores?.[key] ?? scorecard.dimensions?.find((d) => d.key === key)?.score;

  const base = SCORE_EXPLAINERS[key] || SCORE_EXPLAINERS.overall;
  const sn = `SN${scorecard.netuid}`;
  const lines = [`${sn}: ${key} is ${value ?? "—"}/100.`, base];

  if (key === "momentum") {
    const c = scorecard.changes7d || [];
    if (c.length) lines.push(`Recent 7D moves: ${c.slice(0, 3).map((x) => x.display).join("; ")}.`);
  }
  if (key === "risk") {
    lines.push(
      scorecard.risk?.label
        ? `Current label: ${scorecard.risk.label}.`
        : "Check validator count and stake outflows first."
    );
  }
  if (key === "competition") {
    lines.push(
      scorecard.competition?.label
        ? `Current label: ${scorecard.competition.label}.`
        : "Look at miner occupancy and registration cost."
    );
  }
  if (key === "overall") {
    const top = [...(scorecard.dimensions || [])].sort((a, b) => b.score - a.score)[0];
    const low = [...(scorecard.dimensions || [])].sort((a, b) => a.score - b.score)[0];
    if (top) lines.push(`Strongest dimension: ${top.label} (${top.score}).`);
    if (low) lines.push(`Weakest dimension: ${low.label} (${low.score}).`);
  }

  return lines.join(" ");
}

export function localAnswerQuestion(scorecard, question) {
  const q = String(question || "").trim().toLowerCase();
  if (!q) return "Ask a question about this subnet — e.g. why is momentum 79?";

  if (q.includes("watch this week") || q.includes("what should i watch")) {
    const signals = scorecard.watchSignals || [];
    return signals.length
      ? `This week for SN${scorecard.netuid}: ${signals.join(" · ")}`
      : localSummary(scorecard);
  }

  if (q.includes("compare")) {
    return "Open the Compare tab, add 2–5 netuids, then run Compare for a matrix + stronger/weaker explanation.";
  }

  for (const key of Object.keys(SCORE_EXPLAINERS)) {
    if (q.includes(key) || q.includes(`why is ${key}`) || q.includes(`${key} score`)) {
      return localExplainScore(scorecard, key === "overall" ? "overall" : key);
    }
  }

  if (q.includes("why") && q.includes("increase")) {
    const ups = (scorecard.changes7d || []).filter((c) => c.value > 0).slice(0, 3);
    return ups.length
      ? `SN${scorecard.netuid} improved recently mainly from: ${ups.map((c) => c.display).join("; ")}.`
      : localSummary(scorecard);
  }

  if (q.includes("risk")) return localExplainScore(scorecard, "risk");
  if (q.includes("momentum")) return localExplainScore(scorecard, "momentum");
  if (q.includes("summary") || q.includes("explain")) return localSummary(scorecard);

  return `${localSummary(scorecard)} (Tip: ask about a specific score like health, momentum, market, risk, or competition.)`;
}

/**
 * @param {object} scorecard
 * @param {string} scoreKey
 * @param {{ openaiApiKey?: string }} options
 */
export async function explainScore(scorecard, scoreKey, options = {}) {
  const { openaiApiKey } = options;
  if (!openaiApiKey) {
    return { source: "local", text: localExplainScore(scorecard, scoreKey) };
  }
  try {
    const prompt = `Explain why this Bittensor subnet score is what it is in 3-5 sentences.
Score key: ${scoreKey}
Value: ${scoreKey === "overall" ? scorecard.overall : scorecard.scores?.[scoreKey]}
Subnet: SN${scorecard.netuid} (${scorecard.name})
All scores: ${JSON.stringify(scorecard.scores)}
7D changes: ${(scorecard.changes7d || []).map((c) => c.display).join("; ") || "n/a"}
Do not invent metrics.`;
    const text = await openaiChat(openaiApiKey, prompt, 220);
    return { source: "openai", text };
  } catch (err) {
    return {
      source: "local_fallback",
      text: localExplainScore(scorecard, scoreKey),
      warning: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {object} scorecard
 * @param {string} question
 * @param {{ openaiApiKey?: string }} options
 */
export async function answerQuestion(scorecard, question, options = {}) {
  const { openaiApiKey } = options;
  if (!openaiApiKey) {
    return { source: "local", text: localAnswerQuestion(scorecard, question) };
  }
  try {
    const prompt = `Answer the user question about this Bittensor subnet using only provided data.
Question: ${question}

Subnet: SN${scorecard.netuid} (${scorecard.name})
Overall: ${scorecard.overall}
Scores: ${JSON.stringify(scorecard.scores)}
Verdict: ${scorecard.decision?.label}
Strengths: ${(scorecard.strengths || []).map((s) => s.text).join("; ")}
Weaknesses: ${(scorecard.weaknesses || []).map((w) => w.text).join("; ")}
7D: ${(scorecard.changes7d || []).map((c) => c.display).join("; ")}
30D: ${(scorecard.changes30d || []).map((c) => c.display).join("; ")}
Watch signals: ${(scorecard.watchSignals || []).join("; ")}

Keep answer under 6 sentences. No invented metrics.`;
    const text = await openaiChat(openaiApiKey, prompt, 280);
    return { source: "openai", text };
  } catch (err) {
    return {
      source: "local_fallback",
      text: localAnswerQuestion(scorecard, question),
      warning: err instanceof Error ? err.message : String(err),
    };
  }
}
