// background.js
// Central proxy to your backend to avoid page-origin CORS issues.
// Also injects the right-docked panel on normal sites; opens panel.html on New Tab / chrome://.

const BACKEND = "http://localhost:8000"; // ← change if your backend runs elsewhere

// Inject panel on normal sites; open panel.html on New Tab / chrome:// pages
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;

  const url = tab.url || "";
  const isInternal = !url.startsWith("http");
  if (isInternal) {
    // Chrome internal / New Tab → open an extension page instead
    chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
    return;
  }

  chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    })
    .catch((err) => console.error("[Commet] Injection failed:", err));
});

// Proxy fetches from content scripts & extension pages to BACKEND
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === "BACKEND_FETCH") {
      try {
        const res = await fetch(`${BACKEND}${msg.path}`, {
          method: msg.method || "POST",
          headers: {
            "Content-Type": "application/json",
            ...(msg.headers || {}),
          },
          body: msg.body ? JSON.stringify(msg.body) : undefined,
        });

        let data = null;
        let text = null;
        try {
          data = await res.json();
        } catch {
          text = await res.text();
        }

        sendResponse({
          ok: res.ok,
          status: res.status,
          data: data ?? text,
        });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return; // handled
    }
  })();

  // Keep the message channel open for async sendResponse
  return true;
});
