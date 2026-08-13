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
