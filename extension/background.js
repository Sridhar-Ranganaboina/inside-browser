// Inject the right-docked panel on normal sites; open panel.html on New Tab / chrome://
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  const url = tab.url || "";
  const isInternal = !url.startsWith("http");
  if (isInternal) {
    chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
    return;
  }
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  }).catch(err => console.error("[Commet] Injection failed:", err));
});
