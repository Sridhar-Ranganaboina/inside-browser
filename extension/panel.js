const BACKEND = "http://localhost:8000";

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

async function callBackend(path, body) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  return res.json();
}

document.getElementById("btn-sum").addEventListener("click", async () => {
  const task = document.getElementById("task").value.trim() || "Summarize this page";
  logLine(`📝 Summary requested: <b>${task}</b>`);
  const res = await callBackend("/summarize", { task, context: { url: "about:newtab", title: "New Tab", controls: [] } });
  setResultMarkdown(res.summary || String(res));
});

document.getElementById("btn-bm").addEventListener("click", async () => {
  const bm = document.getElementById("bookmark").value;
  if (!bm) { logLine("⚠️ Select a bookmark first"); return; }
  logLine(`🔖 Running bookmark: <b>${bm}</b>`);
  const res = await callBackend("/run_bookmark", { name: bm });
  setResultMarkdown("**Bookmark executed**<br/><br/>" + JSON.stringify(res, null, 2));
});

document.getElementById("btn-auto").addEventListener("click", async () => {
  const task = document.getElementById("task").value.trim();
  if (!task) { logLine("⚠️ Enter a task for automation"); return; }
  logLine(`⚡ Automation: <b>${task}</b>`);
  const res = await callBackend("/plan", { prompt: task, dom: [], start_url: "about:newtab" });
  setResultMarkdown("**Plan (preview; execute on a real site):**<br/><br/>" + JSON.stringify(res, null, 2));
});
