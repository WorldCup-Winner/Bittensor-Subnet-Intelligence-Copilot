(function () {
  const BUTTON_ID = "tao-scout-analyze-btn";
  let lastNetuid = null;

  function detectFromPage() {
    const href = location.href;
    const patterns = [
      /\/subnets?\/(?:sn)?(\d+)\b/i,
      /\/netuid\/(\d+)\b/i,
      /\/sn(\d+)\b/i,
      /[?&](?:netuid|subnet|sn)=(\d+)\b/i,
    ];
    for (const pattern of patterns) {
      const match = href.match(pattern);
      if (match) {
        const netuid = Number(match[1]);
        if (Number.isInteger(netuid) && netuid >= 0 && netuid < 1024) {
          return netuid;
        }
      }
    }

    const titlePatterns = [/\bSN\s*#?\s*(\d+)\b/i, /\bsubnet\s+#?\s*(\d+)\b/i];
    for (const pattern of titlePatterns) {
      const match = document.title.match(pattern);
      if (match) {
        const netuid = Number(match[1]);
        if (Number.isInteger(netuid) && netuid >= 0 && netuid < 1024) {
          return netuid;
        }
      }
    }
    return null;
  }

  function ensureButton(netuid) {
    let btn = document.getElementById(BUTTON_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BUTTON_ID;
      btn.type = "button";
      btn.className = "tao-scout-fab";
      btn.addEventListener("click", onAnalyzeClick);
      document.documentElement.appendChild(btn);
    }
    btn.dataset.netuid = String(netuid);
    btn.innerHTML = `<span class="tao-scout-fab__glyph" aria-hidden="true">◈</span><span>Analyze SN${netuid}</span>`;
    btn.setAttribute("aria-label", `Analyze subnet ${netuid} with TAO Scout`);
  }

  function removeButton() {
    const btn = document.getElementById(BUTTON_ID);
    if (btn) btn.remove();
  }

  async function onAnalyzeClick(event) {
    event.preventDefault();
    const btn = event.currentTarget;
    const netuid = Number(btn.dataset.netuid);
    btn.disabled = true;
    btn.classList.add("is-busy");

    try {
      await chrome.runtime.sendMessage({
        type: "OPEN_SIDE_PANEL",
      });
      await chrome.storage.session.set({
        pendingAnalyzeNetuid: netuid,
        pendingAnalyzeAt: Date.now(),
      });
      // Also kick analysis so side panel can pick up result quickly
      chrome.runtime.sendMessage({ type: "ANALYZE_SUBNET", netuid });
    } catch (err) {
      console.warn("[TAO Scout]", err);
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-busy");
    }
  }

  function sync() {
    const netuid = detectFromPage();
    if (netuid == null) {
      lastNetuid = null;
      removeButton();
      return;
    }
    if (netuid !== lastNetuid) {
      lastNetuid = netuid;
      ensureButton(netuid);
      chrome.storage.session.set({ detectedNetuid: netuid, detectedUrl: location.href });
    } else {
      ensureButton(netuid);
    }
  }

  sync();

  const observer = new MutationObserver(() => sync());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      sync();
    }
  }, 800);
})();
