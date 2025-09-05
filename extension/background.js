// ---- Backend base (edit if you host somewhere else) ----
const BACKEND_BASE = "http://localhost:8000";

// Central fetch proxy to avoid site CORS issues from content scripts.
// Content script calls: { type: "BACKEND_FETCH", path, method, body }
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // Storage session helpers (content script cannot always access storage directly)
    if (msg?.type === "GET_OPEN_FLAG") {
      try {
        const def = typeof msg.defaultVal === "boolean" ? msg.defaultVal : true;
        const data = await chrome.storage.session.get({ commet_open: def });
        sendResponse({ ok: true, value: data.commet_open });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return;
    }
    if (msg?.type === "SET_OPEN_FLAG") {
      try {
        await chrome.storage.session.set({ commet_open: !!msg.value });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return;
    }

    if (msg?.type === "BACKEND_FETCH") {
      try {
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
        let data = null;
        if (ct.includes("application/json")) {
          data = await res.json();
        } else {
          data = await res.text();
        }
        sendResponse({ ok: res.ok, status: res.status, data, error: res.ok ? null : `http_${res.status}` });
      } catch (e) {
        sendResponse({ ok: false, status: 0, error: String(e) });
      }
      return;
    }

    // Allow clicking the extension icon to (re)open the panel on the active tab
    if (msg?.type === "PING") {
      sendResponse({ ok: true });
      return;
    }
  })();
  return true; // keep the message channel open for async responses
});

// Clicking the toolbar icon: ask the current tab to open the panel
chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" });
      await chrome.storage.session.set({ commet_open: true });
    } catch (_e) {
      // no content script on this page (e.g., chrome://); nothing to do
    }
  }
});
