/**
 * Richer SVG historical charts for V1.
 */

function niceMinMax(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return { min: 0, max: 1 };
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  return { min, max };
}

/**
 * @param {number[]} values
 * @param {{ width?: number, height?: number, label?: string, color?: string }} opts
 */
export function renderAreaChart(values, opts = {}) {
  const width = opts.width || 320;
  const height = opts.height || 120;
  const padL = 34;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  const color = opts.color || "#1f7a57";
  const label = opts.label || "";

  const nums = (values || []).map(Number).filter((v) => Number.isFinite(v));
  if (nums.length < 2) {
    return `<div class="chart empty-chart"><p>Not enough history for ${label || "this series"}</p></div>`;
  }

  const { min, max } = niceMinMax(nums);
  const span = max - min || 1;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const points = nums.map((v, i) => {
    const x = padL + (i / (nums.length - 1)) * innerW;
    const y = padT + (1 - (v - min) / span) * innerH;
    return [x, y];
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area =
    `${line} L${points[points.length - 1][0].toFixed(1)} ${(padT + innerH).toFixed(1)}` +
    ` L${points[0][0].toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  const last = points[points.length - 1];
  const yTicks = [max, (max + min) / 2, min];

  return `
  <div class="chart">
    <div class="chart__head">
      <strong>${label}</strong>
      <span>${nums[nums.length - 1].toPrecision(4)}</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" class="chart__svg" role="img" aria-label="${label} chart">
      <defs>
        <linearGradient id="grad-${label.replace(/\W/g, "")}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0.02" />
        </linearGradient>
      </defs>
      ${yTicks
        .map((t, i) => {
          const y = padT + (i / 2) * innerH;
          return `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" class="chart__grid" />
            <text x="2" y="${y + 3}" class="chart__tick">${Number(t).toPrecision(3)}</text>`;
        })
        .join("")}
      <path d="${area}" fill="url(#grad-${label.replace(/\W/g, "")})" />
      <path d="${line}" class="chart__line" stroke="${color}" />
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.2" fill="#d6f56d" stroke="${color}" stroke-width="1.5" />
      <text x="${padL}" y="${height - 6}" class="chart__tick">start</text>
      <text x="${width - padR}" y="${height - 6}" class="chart__tick" text-anchor="end">now</text>
    </svg>
  </div>`;
}

/**
 * @param {object} series map of label -> number[]
 * @param {string[]} order
 */
export function renderHistoryCharts(series, order = ["miners", "validators", "emissions", "stake", "prices"]) {
  if (!series) return `<p class="empty">No history series available.</p>`;
  const labels = {
    miners: "Miners",
    validators: "Validators",
    emissions: "Emissions",
    stake: "Stake / liquidity",
    liquidity: "Liquidity",
    prices: "Price",
  };
  const colors = {
    miners: "#1f7a57",
    validators: "#0f3d2e",
    emissions: "#9a6b12",
    stake: "#2f9e74",
    liquidity: "#2f9e74",
    prices: "#3b6d9b",
  };

  return order
    .filter((key) => Array.isArray(series[key]) && series[key].length > 1)
    .map((key) =>
      renderAreaChart(series[key], {
        label: labels[key] || key,
        color: colors[key] || "#1f7a57",
      })
    )
    .join("");
}
