// ---- Backend base (edit if you host elsewhere) ----
const BACKEND_BASE = "http://localhost:8000";

// Helpers to build a per-tab key
const stateKey = (tabId) => `commet_state_${tabId}`;

// Central listener for CORS proxy + per-tab storage
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      // ----- Per-tab state: GET -----
      if (msg?.type === "GET_STATE") {
        const tabId = msg.tabId || sender?.tab?.id;
        if (!tabId) { sendResponse({ ok: false, error: "no_tab_id" }); return; }
        const data = await chrome.storage.session.get({ [stateKey(tabId)]: null });
        sendResponse({ ok: true, state: data[stateKey(tabId)] || null });
        return;
      }

      // ----- Per-tab state: SET (merge) -----
      if (msg?.type === "SET_STATE") {
        const tabId = msg.tabId || sender?.tab?.id;
        if (!tabId) { sendResponse({ ok: false, error: "no_tab_id" }); return; }
        const key = stateKey(tabId);
        const cur = await chrome.storage.session.get({ [key]: {} });
        const next = Object.assign({}, cur[key] || {}, msg.patch || {});
        await chrome.storage.session.set({ [key]: next });
        sendResponse({ ok: true });
        return;
      }

      // ----- Open flag (legacy, kept for compatibility) -----
      if (msg?.type === "GET_OPEN_FLAG") {
        const def = typeof msg.defaultVal === "boolean" ? msg.defaultVal : true;
        const data = await chrome.storage.session.get({ commet_open: def });
        sendResponse({ ok: true, value: data.commet_open });
        return;
      }
      if (msg?.type === "SET_OPEN_FLAG") {
        await chrome.storage.session.set({ commet_open: !!msg.value });
        sendResponse({ ok: true });
        return;
      }

      // ----- CORS proxy for backend -----
      if (msg?.type === "BACKEND_FETCH") {
        const url = `${BACKEND_BASE}${msg.path || "/"}`;
        const res = await fetch(url, {
          method: msg.method || "GET",
          headers: { "Content-Type": "application/json" },
          body: msg.body ? JSON.stringify(msg.body) : undefined,
          mode: "cors",
          credentials: "omit",
          cache: "no-store"
        });
        const ct = res.headers.get("content-type") || "";
        const data = ct.includes("application/json") ? await res.json() : await res.text();
        sendResponse({ ok: res.ok, status: res.status, data, error: res.ok ? null : `http_${res.status}` });
        return;
      }

      // Ping
      if (msg?.type === "PING") { sendResponse({ ok: true }); return; }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});

// Toolbar icon: ask active tab to open panel and mark open=true
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" });
    await chrome.storage.session.set({ commet_open: true });
  } catch { /* content not available on restricted pages */ }
});
