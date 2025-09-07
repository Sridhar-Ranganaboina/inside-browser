// extension/common/messages.js
// Canonical message & action constants used across background/content.
// Import in background with a normal ESM import.
// In content, load with dynamic import(chrome.runtime.getURL(...)).

export const MSG = {
  OPEN_PANEL: "OPEN_PANEL",
  PING_CONTENT: "PING_CONTENT",

  // Panel state across navigations (kept in background, in-memory per tab)
  GET_STATE: "GET_STATE",
  SET_STATE: "SET_STATE",
  GET_OPEN_FLAG: "GET_OPEN_FLAG",
  SET_OPEN_FLAG: "SET_OPEN_FLAG",

  // Backend bridge (CORS-safe via background fetch)
  BACKEND_FETCH: "BACKEND_FETCH",

  // Automation orchestration
  START_AUTOMATION: "START_AUTOMATION",
  GET_SNAPSHOT: "GET_SNAPSHOT",
  PERFORM_ACTION: "PERFORM_ACTION",

  // Streaming from background → panel
  AUTOMATION_EVENT: "AUTOMATION_EVENT", // { html?, text?, cls? }
  AUTOMATION_STEPS: "AUTOMATION_STEPS"  // { steps: [...] }
};

export const ACT = Object.freeze({
  NAVIGATE:     "navigate",
  CLICK:        "click",
  TYPE:         "type",
  PRESS_ENTER:  "pressEnter",
  SCROLL:       "scroll",
  WAIT_TEXT:    "waitForText",
  DONE:         "done",
});
