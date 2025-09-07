// bg/tabs.js
export function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0].id : undefined);
    });
  });
}

export function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (resp) => resolve(resp));
    } catch (e) {
      resolve(undefined);
    }
  });
}

export async function getSnapshot(tabId, MSG) {
  const resp = await sendToTab(tabId, { type: MSG.GET_SNAPSHOT });
  return resp && resp.snapshot ? resp.snapshot : null;
}

export async function performAction(tabId, MSG, action) {
  const resp = await sendToTab(tabId, { type: MSG.PERFORM_ACTION, action });
  return resp || { ok: false, error: "no-response" };
}
