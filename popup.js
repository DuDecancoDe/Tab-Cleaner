const listEl = document.getElementById("tabList");
const summaryEl = document.getElementById("summary");
const emptyStateEl = document.getElementById("emptyState");
const bulkBarEl = document.getElementById("bulkBar");
const selectAllEl = document.getElementById("selectAll");
const rowTemplate = document.getElementById("tabRowTemplate");

let currentTabs = [];

document.getElementById("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("bulkClose").addEventListener("click", async () => {
  const ids = getSelectedIds();
  if (ids.length === 0) return;
  await chrome.runtime.sendMessage({ type: "CLOSE_TABS", tabIds: ids });
  render();
});

document.getElementById("bulkStillUsing").addEventListener("click", async () => {
  const ids = getSelectedIds();
  if (ids.length === 0) return;
  await chrome.runtime.sendMessage({ type: "MARK_STILL_USING", tabIds: ids });
  render();
});

document.getElementById("bulkSnooze").addEventListener("click", async () => {
  const ids = getSelectedIds();
  if (ids.length === 0) return;
  await chrome.runtime.sendMessage({ type: "SNOOZE_TABS", tabIds: ids, minutes: 60 });
  render();
});

selectAllEl.addEventListener("change", () => {
  const checked = selectAllEl.checked;
  listEl.querySelectorAll(".row-check").forEach((cb) => (cb.checked = checked));
});

function getSelectedIds() {
  const ids = [];
  listEl.querySelectorAll(".tab-row").forEach((row) => {
    const cb = row.querySelector(".row-check");
    if (cb.checked) ids.push(Number(row.dataset.tabId));
  });
  return ids;
}

function formatAge(minutes) {
  if (minutes < 60) return `${minutes}m open`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h open`;
  const days = Math.floor(hours / 24);
  return `${days}d open`;
}

function faviconOrFallback(url) {
  return url && url.startsWith("http")
    ? url
    : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'></svg>";
}

async function render() {
  const tabs = await chrome.runtime.sendMessage({ type: "GET_STALE_TABS" });
  currentTabs = tabs || [];

  if (currentTabs.length === 0) {
    summaryEl.textContent = "";
    emptyStateEl.hidden = false;
    bulkBarEl.hidden = true;
    listEl.innerHTML = "";
    return;
  }

  emptyStateEl.hidden = true;
  bulkBarEl.hidden = false;
  summaryEl.textContent = `${currentTabs.length} tab${currentTabs.length === 1 ? "" : "s"} have been open a while. Still need them?`;

  listEl.innerHTML = "";
  for (const tab of currentTabs) {
    const node = rowTemplate.content.cloneNode(true);
    const row = node.querySelector(".tab-row");
    row.dataset.tabId = tab.id;

    node.querySelector(".favicon").src = faviconOrFallback(tab.favIconUrl);
    node.querySelector(".tab-title").textContent = tab.title || tab.url || "Untitled tab";
    node.querySelector(".tab-title").title = tab.url || "";
    node.querySelector(".tab-meta").textContent = formatAge(tab.ageMinutes);

    node.querySelector(".still-using").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "MARK_STILL_USING", tabIds: [tab.id] });
      render();
    });

    node.querySelector(".close-tab").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "CLOSE_TABS", tabIds: [tab.id] });
      render();
    });

    row.addEventListener("dblclick", (e) => {
      if (e.target.tagName === "BUTTON") return;
      chrome.tabs.update(tab.id, { active: true });
      chrome.tabs.get(tab.id, (t) => chrome.windows.update(t.windowId, { focused: true }));
    });

    listEl.appendChild(node);
  }

  selectAllEl.checked = false;
}

render();
