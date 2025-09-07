// extension/content/ui.js
// Renders the side panel UI and handles log/result/steps presentation.

import { MSG } from "../common/messages.js";

function mdToHtml(mdText) {
  let html = (mdText || "");
  html = html
    .replace(/^### (.*)$/gim, "<h3>$1</h3>")
    .replace(/^## (.*)$/gim, "<h2>$1</h2>")
    .replace(/^# (.*)$/gim, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\n\n\n+/g, "\n\n")
    .replace(/\n/g, "<br/>");
  return html;
}

let _hostEl = null;
let _shadow = null;

export function mountPanel() {
  if (document.getElementById("commet-root-host")) {
    ensurePanelVisible();
    return { shadowRoot: _shadow };
  }

  const PANEL_WIDTH = "20vw";

  _hostEl = document.createElement("div");
  _hostEl.id = "commet-root-host";
  _hostEl.style.position = "fixed";
  _hostEl.style.top = "0";
  _hostEl.style.right = "0";
  _hostEl.style.width = PANEL_WIDTH;
  _hostEl.style.height = "100%";
  _hostEl.style.zIndex = "2147483647";
  document.body.appendChild(_hostEl);

  document.body.style.paddingRight = PANEL_WIDTH;

  _shadow = _hostEl.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    .wrap {
      height: 100%;
      background: #fff;
      border-left: 1px solid #e6e6e6;
      display: grid;
      grid-template-rows: auto auto auto auto auto auto 1fr;
    }
    .header { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#3f6efb; color:#fff; font-weight:700; }
    .drag-hint { font-size:12px; opacity:.85 }
    .close { border:0; background:#ff4d4f; color:#fff; border-radius:8px; padding:4px 10px; cursor:pointer; font-weight:800; }
    .task { padding:8px; }
    .task textarea { width:100%; height:64px; padding:12px; border:1px solid #d8d8d8; border-radius:12px; outline:none; font-size:14px; }
    .actions { padding:8px; display:grid; grid-template-columns: 1fr 1fr; column-gap:10px; row-gap:10px; }
    .btn { padding:10px 14px; background:#3f6efb; color:#fff; border:1px solid #3f6efb; border-radius:14px; cursor:pointer; font-weight:700; font-size:14px; }
    .btn:hover { background:#2f57d9; }
    .select-row { padding:0 8px; }
    select { width:100%; padding:10px; border:1px solid #d8d8d8; border-radius:12px; font-size:14px; }
    .bm-row { padding:8px; }
    .tabs { display:flex; gap:8px; padding:8px; justify-content:center; }
    .tab { border:1px solid #e6e6e6; padding:6px 10px; border-radius:12px; cursor:pointer; font-weight:700; }
    .tab.active { background:#f2f6ff; border-color:#b9d1ff; color:#3f6efb; }
    .panel { grid-row: 7; border-top:1px solid #e6e6e6; margin-top:6px; height:100%; overflow:auto; padding:10px;
             font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size:12.5px; }
    .muted { color:#666; }
    .ok { color:#209361; }
    .err { color:#c62828; }
    .log-line { margin: 3px 0; }
  `;

  const root = document.createElement("div");
  root.className = "wrap";
  root.innerHTML = `
    <div class="header" id="commet-drag">
      <div>Commet Assistant <span class="drag-hint">• drag header to move vertically</span></div>
      <button class="close" id="commet-close" title="Close">X</button>
    </div>
    <div class="task">
      <textarea id="task" placeholder="Ask me something… (e.g., 'search for cricket news', 'summarize this page')"></textarea>
    </div>
    <div class="actions">
      <button class="btn" id="btn-auto">⚡ Run Automation</button>
      <button class="btn" id="btn-sum">📝 Summarize</button>
    </div>
    <div class="select-row">
      <select id="bookmark">
        <option value="">-- Select a bookmark --</option>
        <option value="create_change_request">Create Change Request</option>
        <option value="list_incidents">List Incidents (this month)</option>
        <option value="raise_ticket">Raise Ticket</option>
      </select>
    </div>
    <div class="bm-row">
      <button class="btn" id="btn-bm">🔖 Run Bookmark</button>
    </div>
    <div class="tabs">
      <div class="tab active" data-tab="log">Log</div>
      <div class="tab" data-tab="result">Result</div>
      <div class="tab" data-tab="steps">Steps</div>
    </div>
    <div class="panel" id="panel-log"><div class="muted">Logs & diagnostics will appear here…</div></div>
    <div class="panel" id="panel-result" style="display:none;"></div>
    <div class="panel" id="panel-steps" style="display:none;"></div>
  `;

  _shadow.append(style, root);

  // Prevent site hotkeys from stealing Enter etc.
  ["keydown","keypress","keyup"].forEach(type => {
    _shadow.addEventListener(type, (e) => { if (e.isTrusted) e.stopPropagation(); }, { capture: true });
  });

  // Tabs
  const panels = {
    log: _shadow.getElementById("panel-log"),
    result: _shadow.getElementById("panel-result"),
    steps: _shadow.getElementById("panel-steps"),
  };
  function switchTab(name) {
    _shadow.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    Object.keys(panels).forEach(k => panels[k].style.display = (k === name ? "block" : "none"));
  }
  _shadow.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));

  // logging
  function appendLogHTML(html, cls="") {
    const div = document.createElement("div");
    div.className = `log-line ${cls}`.trim();
    div.innerHTML = html;
    panels.log.appendChild(div);
    panels.log.scrollTop = panels.log.scrollHeight;
  }

  function setResultMarkdown(mdText) {
    panels.result.innerHTML = mdToHtml(mdText);
    switchTab("result");
  }

  function setSteps(stepsArr) {
    if (!Array.isArray(stepsArr)) stepsArr = [];
    const pretty = stepsArr.map((s, i) => {
      const q = s.query ? ` {role:${s.query.role||"-"}, name:${s.query.name||"-"}}` : "";
      const t = s.text ? ` "${s.text}"` : "";
      if (s.action === "type") return `${i+1}. type${t}${q}`;
      if (s.action === "click") return `${i+1}. click${q}`;
      if (s.action === "navigate") return `${i+1}. navigate to ${s.url||""}`;
      if (s.action === "pressEnter") return `${i+1}. press Enter`;
      if (s.action === "waitForText") return `${i+1}. waitForText "${s.text||""}"`;
      if (s.action === "scroll") return `${i+1}. scroll ${s.direction||"down"}`;
      if (s.action === "done") return `${i+1}. done`;
      return `${i+1}. ${s.action}`;
    }).join("\n");
    panels.steps.textContent = pretty;
  }

  // Listen for streaming events from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === MSG.AUTOMATION_EVENT) {
      if (msg.html) appendLogHTML(msg.html, msg.cls || "");
      else if (msg.text) appendLogHTML(msg.text, msg.cls || "");
    }
    if (msg?.type === MSG.AUTOMATION_STEPS) {
      setSteps(msg.steps || []);
    }
  });

  const taskEl = _shadow.getElementById("task");
  const bookmarkEl = _shadow.getElementById("bookmark");

  // Simple vertical drag
  (() => {
    const header = _shadow.getElementById("commet-drag");
    let startY = 0, startTop = 0, dragging = false;
    header.style.cursor = "grab";
    header.addEventListener("mousedown", (e) => {
      dragging = true; startY = e.clientY; startTop = parseInt(_hostEl.style.top || "0", 10);
      header.style.cursor = "grabbing"; e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      _hostEl.style.top = `${Math.max(0, startTop + dy)}px`;
    });
    window.addEventListener("mouseup", () => { dragging = false; header.style.cursor = "grab"; });
  })();

  // Close button hides panel but keeps state in background
  _shadow.getElementById("commet-close").addEventListener("click", async () => {
    _hostEl.style.display = "none";
    document.body.style.paddingRight = "";
    chrome.runtime.sendMessage({ type: MSG.SET_OPEN_FLAG, value: false }, () => {});
  });

  return {
    shadowRoot: _shadow,
    elements: { taskEl, bookmarkEl, panels },
    api: { appendLogHTML, setResultMarkdown, setSteps, switchTab }
  };
}

export function ensurePanelVisible() {
  const host = document.getElementById("commet-root-host");
  if (host) {
    host.style.display = "block";
    host.scrollIntoView({ block: "start" });
  } else {
    mountPanel();
  }
}

export function restoreStateIntoUI(shadowRoot, st) {
  if (!shadowRoot || !st) return;
  const taskEl = shadowRoot.getElementById("task");
  const bookmarkEl = shadowRoot.getElementById("bookmark");
  const logEl = shadowRoot.getElementById("panel-log");
  const resEl = shadowRoot.getElementById("panel-result");
  const stepsEl = shadowRoot.getElementById("panel-steps");

  if (typeof st.prompt === "string") taskEl.value = st.prompt;
  if (typeof st.bookmark === "string") bookmarkEl.value = st.bookmark;
  if (typeof st.logHTML === "string") logEl.innerHTML = st.logHTML;
  if (typeof st.resultHTML === "string") resEl.innerHTML = st.resultHTML;
  if (typeof st.stepsJSON === "string") {
    try {
      const arr = JSON.parse(st.stepsJSON);
      resEl.textContent = "";
      stepsEl.textContent = arr.map((s, i) => {
        const q = s.query ? ` {role:${s.query.role||"-"}, name:${s.query.name||"-"}}` : "";
        const t = s.text ? ` "${s.text}"` : "";
        if (s.action === "type") return `${i+1}. type${t}${q}`;
        if (s.action === "click") return `${i+1}. click${q}`;
        if (s.action === "navigate") return `${i+1}. navigate to ${s.url||""}`;
        if (s.action === "pressEnter") return `${i+1}. press Enter`;
        if (s.action === "waitForText") return `${i+1}. waitForText "${s.text||""}"`;
        if (s.action === "scroll") return `${i+1}. scroll ${s.direction||"down"}`;
        if (s.action === "done") return `${i+1}. done`;
        return `${i+1}. ${s.action}`;
      }).join("\n");
    } catch { stepsEl.textContent = st.stepsJSON || ""; }
  }
}
