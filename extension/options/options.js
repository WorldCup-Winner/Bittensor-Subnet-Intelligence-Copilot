const form = document.getElementById("settingsForm");
const taostatsApiKey = document.getElementById("taostatsApiKey");
const openaiApiKey = document.getElementById("openaiApiKey");
const preferDemo = document.getElementById("preferDemo");
const saveMsg = document.getElementById("saveMsg");

async function load() {
  const stored = await chrome.storage.sync.get({
    taostatsApiKey: "",
    openaiApiKey: "",
    preferDemo: false,
  });
  taostatsApiKey.value = stored.taostatsApiKey || "";
  openaiApiKey.value = stored.openaiApiKey || "";
  preferDemo.checked = Boolean(stored.preferDemo);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await chrome.storage.sync.set({
    taostatsApiKey: taostatsApiKey.value.trim(),
    openaiApiKey: openaiApiKey.value.trim(),
    preferDemo: preferDemo.checked,
  });
  saveMsg.hidden = false;
  setTimeout(() => {
    saveMsg.hidden = true;
  }, 1600);
});

load();
