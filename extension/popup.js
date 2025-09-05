document.getElementById("run-automation").onclick = () => {
  chrome.runtime.sendMessage({ type: "RUN_AUTOMATION" });
};
document.getElementById("run-summary").onclick = () => {
  chrome.runtime.sendMessage({ type: "RUN_SUMMARY" });
};
document.getElementById("run-bookmark").onclick = () => {
  const bm = document.getElementById("bookmark-select").value;
  chrome.runtime.sendMessage({ type: "RUN_BOOKMARK", bookmark: bm });
};
