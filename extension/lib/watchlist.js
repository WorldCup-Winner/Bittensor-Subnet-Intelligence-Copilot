/**
 * Local watchlist with notes + sort (V1).
 */

const STORAGE_KEY = "watchlist";
const PREFS_KEY = "watchlistPrefs";
const MAX_ITEMS = 30;

export const WATCHLIST_SORTS = [
  { id: "updated", label: "Recently updated" },
  { id: "score_desc", label: "Score high → low" },
  { id: "score_asc", label: "Score low → high" },
  { id: "name", label: "Name A → Z" },
  { id: "netuid", label: "Netuid" },
  { id: "added", label: "Date added" },
];

async function readAll() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
}

async function writeAll(items) {
  await chrome.storage.local.set({ [STORAGE_KEY]: items });
  return items;
}

export async function getWatchlistPrefs() {
  const stored = await chrome.storage.local.get({
    [PREFS_KEY]: { sort: "updated" },
  });
  return stored[PREFS_KEY] || { sort: "updated" };
}

export async function setWatchlistPrefs(prefs) {
  const current = await getWatchlistPrefs();
  const next = { ...current, ...prefs };
  await chrome.storage.local.set({ [PREFS_KEY]: next });
  return next;
}

function sortItems(items, sortId) {
  const list = [...items];
  switch (sortId) {
    case "score_desc":
      return list.sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
    case "score_asc":
      return list.sort((a, b) => (a.overall ?? 999) - (b.overall ?? 999));
    case "name":
      return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    case "netuid":
      return list.sort((a, b) => a.netuid - b.netuid);
    case "added":
      return list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    case "updated":
    default:
      return list.sort((a, b) => (b.updatedAt || b.addedAt || 0) - (a.updatedAt || a.addedAt || 0));
  }
}

export async function listWatchlist(sortId) {
  const items = await readAll();
  const prefs = await getWatchlistPrefs();
  return sortItems(items, sortId || prefs.sort || "updated");
}

export async function isWatched(netuid) {
  const items = await readAll();
  return items.some((item) => item.netuid === Number(netuid));
}

export async function getWatchItem(netuid) {
  const items = await readAll();
  return items.find((item) => item.netuid === Number(netuid)) || null;
}

/**
 * @param {object} entry
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
    scores: entry.scores || existing?.scores || null,
    verdict: entry.verdict || existing?.verdict || null,
    health: entry.health || existing?.health || null,
    note: entry.note !== undefined ? String(entry.note).slice(0, 500) : existing?.note || "",
    snapshot: entry.snapshot || existing?.snapshot || null,
    addedAt: existing?.addedAt || now,
    updatedAt: now,
  };

  const next = [nextItem, ...items.filter((item) => item.netuid !== netuid)].slice(0, MAX_ITEMS);
  await writeAll(next);
  return nextItem;
}

export async function updateWatchNote(netuid, note) {
  const item = await getWatchItem(netuid);
  if (!item) throw new Error("Subnet not on watchlist");
  return addToWatchlist({ ...item, note: String(note || "").slice(0, 500) });
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
