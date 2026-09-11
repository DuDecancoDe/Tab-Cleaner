// ---- Stale Tab Cleaner: background service worker ----

const DEFAULTS = {
  thresholdMinutes: 120,   // how "old" a tab must be to count as stale
  checkIntervalMinutes: 15, // how often we scan for stale tabs
  notifyEnabled: true,
  ignorePinned: true,
  ignoreAudible: true      // ignore tabs currently playing audio/video
};

const STORAGE_KEYS = {
  settings: "settings",
  tabOpenedAt: "tabOpenedAt", // { [tabId]: timestamp }
  snoozed: "snoozed"          // { [tabId]: timestampUntilWhichToIgnore }
};

// ---------- Setup ----------

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get(STORAGE_KEYS.settings);
  if (!settings) {
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULTS });
  }
  await seedExistingTabs();
  scheduleAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await seedExistingTabs();
  scheduleAlarm();
});

async function seedExistingTabs() {
  const tabs = await chrome.tabs.query({});
  const { tabOpenedAt = {} } = await chrome.storage.local.get(STORAGE_KEYS.tabOpenedAt);
  const now = Date.now();
  let changed = false;
  for (const tab of tabs) {
    if (!(tab.id in tabOpenedAt)) {
      tabOpenedAt[tab.id] = now;
      changed = true;
    }
  }
  if (changed) {
    await chrome.storage.local.set({ [STORAGE_KEYS.tabOpenedAt]: tabOpenedAt });
  }
}

async function scheduleAlarm() {
  const { settings } = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const interval = (settings && settings.checkIntervalMinutes) || DEFAULTS.checkIntervalMinutes;
  chrome.alarms.create("staleTabCheck", { periodInMinutes: interval });
}

// ---------- Track tab lifecycle ----------

chrome.tabs.onCreated.addListener(async (tab) => {
  const { tabOpenedAt = {} } = await chrome.storage.local.get(STORAGE_KEYS.tabOpenedAt);
  tabOpenedAt[tab.id] = Date.now();
  await chrome.storage.local.set({ [STORAGE_KEYS.tabOpenedAt]: tabOpenedAt });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { tabOpenedAt = {} } = await chrome.storage.local.get(STORAGE_KEYS.tabOpenedAt);
  const { snoozed = {} } = await chrome.storage.local.get(STORAGE_KEYS.snoozed);
  delete tabOpenedAt[tabId];
  delete snoozed[tabId];
  await chrome.storage.local.set({
    [STORAGE_KEYS.tabOpenedAt]: tabOpenedAt,
    [STORAGE_KEYS.snoozed]: snoozed
  });
});

// Treat navigating to a brand-new page in the same tab as "still using it" —
// only reset the clock on a real top-level navigation (not every SPA route change).
chrome.webNavigation?.onCommitted?.addListener((details) => {
  if (details.frameId !== 0) return;
  // We don't reset on every navigation (that would hide genuinely idle tabs
  // that keep auto-refreshing). Activity is instead tracked via onActivated.
});

// If the user actively switches to / interacts with a tab, treat it as "used"
// but do NOT reset its age — activity resets should only happen when the user
// explicitly says "yes I'm still using this" in the prompt, so genuinely
// forgotten tabs still get flagged even if Chrome briefly focuses them.

// ---------- Alarm: scan for stale tabs ----------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "staleTabCheck") {
    await checkForStaleTabs();
  }
});

async function checkForStaleTabs() {
  const { settings = DEFAULTS } = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const { tabOpenedAt = {} } = await chrome.storage.local.get(STORAGE_KEYS.tabOpenedAt);
  const { snoozed = {} } = await chrome.storage.local.get(STORAGE_KEYS.snoozed);

  const thresholdMs = (settings.thresholdMinutes ?? DEFAULTS.thresholdMinutes) * 60 * 1000;
  const now = Date.now();

  const tabs = await chrome.tabs.query({});
  const staleTabs = [];

  for (const tab of tabs) {
    if (settings.ignorePinned && tab.pinned) continue;
    if (settings.ignoreAudible && tab.audible) continue;

    const openedAt = tabOpenedAt[tab.id];
    if (!openedAt) continue;

    const snoozedUntil = snoozed[tab.id];
    if (snoozedUntil && snoozedUntil > now) continue;

    if (now - openedAt >= thresholdMs) {
      staleTabs.push(tab);
    }
  }

  await chrome.storage.local.set({ staleTabCount: staleTabs.length });
  updateBadge(staleTabs.length);

  if (staleTabs.length > 0 && settings.notifyEnabled) {
    chrome.notifications.create("stale-tabs-alert", {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Old tabs piling up",
      message: `You have ${staleTabs.length} tab${staleTabs.length === 1 ? "" : "s"} open for over ${settings.thresholdMinutes} minutes. Click to review.`,
      priority: 1
    });
  }
}

function updateBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: "#d9534f" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId === "stale-tabs-alert") {
    chrome.action.openPopup?.();
  }
});

// ---------- Messaging with popup ----------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_STALE_TABS") {
    getStaleTabsDetailed().then(sendResponse);
    return true; // async response
  }
  if (message.type === "CLOSE_TABS") {
    chrome.tabs.remove(message.tabIds).then(() => {
      checkForStaleTabs();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message.type === "SNOOZE_TABS") {
    snoozeTabs(message.tabIds, message.minutes).then(() => {
      checkForStaleTabs();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message.type === "MARK_STILL_USING") {
    // "Yes I'm still using this" -> reset the clock and clear snooze
    resetTabTimers(message.tabIds).then(() => {
      checkForStaleTabs();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message.type === "GET_SETTINGS") {
    chrome.storage.local.get(STORAGE_KEYS.settings).then((r) =>
      sendResponse(r.settings || DEFAULTS)
    );
    return true;
  }
  if (message.type === "SAVE_SETTINGS") {
    chrome.storage.local.set({ [STORAGE_KEYS.settings]: message.settings }).then(async () => {
      await scheduleAlarm();
      await checkForStaleTabs();
      sendResponse({ ok: true });
    });
    return true;
  }
});

async function getStaleTabsDetailed() {
  const { settings = DEFAULTS } = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const { tabOpenedAt = {} } = await chrome.storage.local.get(STORAGE_KEYS.tabOpenedAt);
  const { snoozed = {} } = await chrome.storage.local.get(STORAGE_KEYS.snoozed);
  const thresholdMs = (settings.thresholdMinutes ?? DEFAULTS.thresholdMinutes) * 60 * 1000;
  const now = Date.now();

  const tabs = await chrome.tabs.query({});
  const result = [];

  for (const tab of tabs) {
    if (settings.ignorePinned && tab.pinned) continue;
    if (settings.ignoreAudible && tab.audible) continue;

    const openedAt = tabOpenedAt[tab.id];
    if (!openedAt) continue;

    const snoozedUntil = snoozed[tab.id];
    if (snoozedUntil && snoozedUntil > now) continue;

    if (now - openedAt >= thresholdMs) {
      result.push({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
        openedAt,
        ageMinutes: Math.round((now - openedAt) / 60000)
      });
    }
  }

  result.sort((a, b) => b.ageMinutes - a.ageMinutes);
  return result;
}

async function resetTabTimers(tabIds) {
  const { tabOpenedAt = {} } = await chrome.storage.local.get(STORAGE_KEYS.tabOpenedAt);
  const { snoozed = {} } = await chrome.storage.local.get(STORAGE_KEYS.snoozed);
  const now = Date.now();
  for (const id of tabIds) {
    tabOpenedAt[id] = now;
    delete snoozed[id];
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.tabOpenedAt]: tabOpenedAt,
    [STORAGE_KEYS.snoozed]: snoozed
  });
}

async function snoozeTabs(tabIds, minutes) {
  const { snoozed = {} } = await chrome.storage.local.get(STORAGE_KEYS.snoozed);
  const until = Date.now() + minutes * 60 * 1000;
  for (const id of tabIds) {
    snoozed[id] = until;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.snoozed]: snoozed });
}
