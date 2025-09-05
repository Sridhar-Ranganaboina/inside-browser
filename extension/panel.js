// panel.js
// Use background proxy for all backend calls (avoids CORS entirely).
function callBackend(path, body) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "BACKEND_FETCH", path, method: "POST", body },
      (resp) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
          return;
        }
        if (resp?.ok) resolve(resp.data);
        else reject(resp?.error || `backend_error_${resp?.status || "unknown"}`);
      }
    );
  });
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".panel").forEach(p => p.style.display = "none");
  document.getElementById(`panel-${name}`).style.display = "block";
}
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));

function setResultMarkdown(mdText) {
  const html = (mdText || "")
    .replace(/^### (.*)$/gim, "<h3>$1</h3>")
    .replace(/^## (.*)$/gim, "<h2>$1</h2>")
    .replace(/^# (.*)$/gim, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
  document.getElementById("panel-result").innerHTML = html;
  switchTab("result");
}
function showSteps(executed) {
  document.getElementById("panel-steps").textContent = JSON.stringify(executed, null, 2);
  switchTab("steps");
}
function logLine(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  const p = document.getElementById("panel-log");
  p.appendChild(div); p.scrollTop = p.scrollHeight;
}

document.getElementById("btn-sum").addEventListener("click", async () => {
  const task = document.getElementById("task").value.trim() || "Summarize this page";
  logLine(`📝 Summary requested: <b>${task}</b>`);
  try {
    const res = await callBackend("/summarize", { task, context: { url: "about:newtab", title: "New Tab", controls: [] } });
    setResultMarkdown(res.summary || JSON.stringify(res));
  } catch (e) {
    logLine(`❌ summarize error: ${String(e)}`);
  }
});

document.getElementById("btn-bm").addEventListener("click", async () => {
  const bm = document.getElementById("bookmark").value;
  if (!bm) { logLine("⚠️ Select a bookmark first"); return; }
  logLine(`🔖 Running bookmark: <b>${bm}</b>`);
  try {
    const res = await callBackend("/run_bookmark", { name: bm });
    setResultMarkdown("**Bookmark executed**<br/><br/>" + JSON.stringify(res, null, 2));
  } catch (e) {
    logLine(`❌ bookmark error: ${String(e)}`);
  }
});

document.getElementById("btn-auto").addEventListener("click", async () => {
  const task = document.getElementById("task").value.trim();
  if (!task) { logLine("⚠️ Enter a task for automation"); return; }
  logLine(`⚡ Automation (preview on internal page): <b>${task}</b>`);
  try {
    const res = await callBackend("/plan", { prompt: task, dom: [], start_url: "about:newtab" });
    setResultMarkdown("**Plan (preview; run this on a real site to execute):**<br/><br/>" + JSON.stringify(res, null, 2));
  } catch (e) {
    logLine(`❌ plan error: ${String(e)}`);
  }
});
