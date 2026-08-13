/**
 * Detect Bittensor subnet (netuid) from a page URL or title.
 */

const PATH_PATTERNS = [
  /\/subnets?\/(?:sn)?(\d+)\b/i,
  /\/netuid\/(\d+)\b/i,
  /\/sn(\d+)\b/i,
  /[?&](?:netuid|subnet|sn)=(\d+)\b/i,
];

const TEXT_PATTERNS = [
  /\bSN\s*#?\s*(\d+)\b/i,
  /\bsubnet\s+#?\s*(\d+)\b/i,
  /\bnetuid\s*[:=]?\s*(\d+)\b/i,
];

/**
 * @param {string} url
 * @param {string} [pageTitle]
 * @returns {{ netuid: number, source: string } | null}
 */
export function detectSubnet(url, pageTitle = "") {
  try {
    const href = String(url || "");
    for (const pattern of PATH_PATTERNS) {
      const match = href.match(pattern);
      if (match) {
        const netuid = Number(match[1]);
        if (Number.isInteger(netuid) && netuid >= 0 && netuid < 1024) {
          return { netuid, source: "url" };
        }
      }
    }

    const title = String(pageTitle || "");
    for (const pattern of TEXT_PATTERNS) {
      const match = title.match(pattern);
      if (match) {
        const netuid = Number(match[1]);
        if (Number.isInteger(netuid) && netuid >= 0 && netuid < 1024) {
          return { netuid, source: "title" };
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function isSupportedHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return (
    host.endsWith("taostats.io") ||
    host.endsWith("bittensor.com") ||
    host.endsWith("tao.app") ||
    host.endsWith("taomarketcap.com")
  );
}
