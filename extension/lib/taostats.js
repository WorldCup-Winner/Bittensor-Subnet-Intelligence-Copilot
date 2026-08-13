/**
 * Shared Taostats HTTP helpers + value normalization.
 */

export const TAOSTATS_BASE = "https://api.taostats.io";

export function raoToTao(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) >= 1e6 ? n / 1e9 : n;
}

export function pick(obj, keys, fallback = null) {
  if (!obj || typeof obj !== "object") return fallback;
  for (const key of keys) {
    if (obj[key] != null) return obj[key];
  }
  return fallback;
}

export async function taostatsGet(path, apiKey) {
  const res = await fetch(`${TAOSTATS_BASE}${path}`, {
    headers: {
      Authorization: apiKey,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Taostats ${res.status}: ${text.slice(0, 180) || res.statusText}`);
  }
  return res.json();
}

export function rowsFrom(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  if (payload.data && typeof payload.data === "object") return [payload.data];
  return [payload];
}

export function firstRow(payload) {
  return rowsFrom(payload)[0] || null;
}

export function pctChange(current, previous) {
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return Number((((c - p) / Math.abs(p)) * 100).toFixed(1));
}

export function parseTimestamp(row) {
  if (!row) return 0;
  if (row.timestamp) {
    const t = Date.parse(row.timestamp);
    if (Number.isFinite(t)) return t;
  }
  if (row.block_number) return Number(row.block_number) || 0;
  return 0;
}
