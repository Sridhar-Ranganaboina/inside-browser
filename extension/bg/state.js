// bg/state.js
const stateByTab = new Map();

export function getTabState(tabId) {
  if (!stateByTab.has(tabId)) {
    stateByTab.set(tabId, {
      open: true,
      prompt: "",
      logHTML: "",
      resultHTML: "",
      stepsJSON: "",
      bookmark: "",
      activeTab: "log",
    });
  }
  return stateByTab.get(tabId);
}

export function setTabState(tabId, patch) {
  const st = getTabState(tabId);
  Object.assign(st, patch || {});
  return st;
}
