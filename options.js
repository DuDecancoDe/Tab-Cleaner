const thresholdEl = document.getElementById("threshold");
const intervalEl = document.getElementById("interval");
const notifyEl = document.getElementById("notifyEnabled");
const ignorePinnedEl = document.getElementById("ignorePinned");
const ignoreAudibleEl = document.getElementById("ignoreAudible");
const savedMsg = document.getElementById("savedMsg");

async function load() {
  const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  thresholdEl.value = settings.thresholdMinutes;
  intervalEl.value = settings.checkIntervalMinutes;
  notifyEl.checked = settings.notifyEnabled;
  ignorePinnedEl.checked = settings.ignorePinned;
  ignoreAudibleEl.checked = settings.ignoreAudible;
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const settings = {
    thresholdMinutes: Number(thresholdEl.value) || 120,
    checkIntervalMinutes: Number(intervalEl.value) || 15,
    notifyEnabled: notifyEl.checked,
    ignorePinned: ignorePinnedEl.checked,
    ignoreAudible: ignoreAudibleEl.checked
  };
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
  savedMsg.style.opacity = "1";
  setTimeout(() => (savedMsg.style.opacity = "0"), 1500);
});

load();
