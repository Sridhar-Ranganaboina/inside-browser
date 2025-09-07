// extension/content/state.js
// Background-bridged per-tab state + CORS-safe backend fetch (via background).

import { MSG } from "../common/messages.js";

export function getState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: MSG.GET_STATE }, (resp) => {
      resolve(resp && resp.ok ? (resp.state || {}) : {});
    });
  });
}

export function setState(patch) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: MSG.SET_STATE, patch }, () => resolve());
  });
}

export function getOpenFlag(defaultVal = true) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: MSG.GET_OPEN_FLAG, defaultVal }, (resp) => {
      resolve(resp && resp.ok ? !!resp.value : defaultVal);
    });
  });
}

export function setOpenFlag(value) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: MSG.SET_OPEN_FLAG, value: !!value }, () => resolve());
  });
}

// CORS-safe backend bridge
export function callBackend(path, body) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: MSG.BACKEND_FETCH, path, body, method: "POST" },
      (resp) => {
        if (chrome.runtime.lastError) { reject(chrome.runtime.lastError.message); return; }
        if (resp?.ok) resolve(resp.data);
        else reject(resp?.error || `backend_error_${resp?.status || "unknown"}`);
      }
    );
  });
}
