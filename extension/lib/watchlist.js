/**
 * Local watchlist persisted in chrome.storage.local (no billing).
 */

const STORAGE_KEY = "watchlist";
const MAX_ITEMS = 30;

async function readAll() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
}

async function writeAll(items) {
  await chrome.storage.local.set({ [STORAGE_KEY]: items });
  return items;
}

export async function listWatchlist() {
  const items = await readAll();
  return items.sort((a, b) => (b.updatedAt || b.addedAt || 0) - (a.updatedAt || a.addedAt || 0));
}

export async function isWatched(netuid) {
  const items = await readAll();
  return items.some((item) => item.netuid === Number(netuid));
}

/**
 * @param {{ netuid: number, name?: string, overall?: number, verdict?: string, health?: string }} entry
 */
export async function addToWatchlist(entry) {
  const netuid = Number(entry.netuid);
  if (!Number.isInteger(netuid) || netuid < 0) {
    throw new Error("Invalid netuid");
  }

  const now = Date.now();
  const items = await readAll();
  const existing = items.find((item) => item.netuid === netuid);
  const nextItem = {
    netuid,
    name: entry.name || existing?.name || `SN${netuid}`,
    overall: entry.overall ?? existing?.overall ?? null,
    verdict: entry.verdict || existing?.verdict || null,
    health: entry.health || existing?.health || null,
    addedAt: existing?.addedAt || now,
    updatedAt: now,
  };

  const next = [nextItem, ...items.filter((item) => item.netuid !== netuid)].slice(0, MAX_ITEMS);
  await writeAll(next);
  return nextItem;
}

export async function removeFromWatchlist(netuid) {
  const id = Number(netuid);
  const items = await readAll();
  const next = items.filter((item) => item.netuid !== id);
  await writeAll(next);
  return { removed: items.length !== next.length, items: next };
}

export async function toggleWatchlist(entry) {
  if (await isWatched(entry.netuid)) {
    const result = await removeFromWatchlist(entry.netuid);
    return { watched: false, items: result.items };
  }
  await addToWatchlist(entry);
  return { watched: true, items: await listWatchlist() };
}
