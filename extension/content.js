(() => {
  if (window.__commet_loaded__) return;
  window.__commet_loaded__ = true;

  const PANEL_WIDTH = "20vw";

  // ---------- Utilities ----------
  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    if (el.id) return `#${CSS.escape(el.id)}`;
    const path = [];
    while (el && el.nodeType === Node.ELEMENT_NODE && el !== document.body) {
      let sel = el.nodeName.toLowerCase();
      if (el.classList.length) sel += "." + [...el.classList].map(c => CSS.escape(c)).join(".");
      const parent = el.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter(n => n.nodeName === el.nodeName);
        if (siblings.length > 1) sel += `:nth-of-type(${siblings.indexOf(el) + 1})`;
      }
      path.unshift(sel);
      el = el.parentElement;
    }
    return path.join(" > ");
  }

  function snapshotPage() {
    const q = "a[href], button, [role=button], input, textarea, select, [role]";
    const controls = [...document.querySelectorAll(q)].map(el => ({
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.value || "").trim(),
      role: el.getAttribute("role") || null,
      name:
        el.getAttribute("aria-label") ||
        el.getAttribute("name") ||
        el.getAttribute("title") ||
        el.placeholder ||
        (el.innerText || "").trim(),
      href: el.getAttribute("href") || null,
      selector: cssPath(el),
    }));
    return { url: location.href, title: document.title, controls };
  }

  // ---- Proxy all backend calls via background to avoid CORS ----
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

  async function performAction(step) {
    try {
      const t = (step.action || "").toLowerCase();
      if (t === "navigate" && step.url) {
        window.location.href = step.url;
        return { ok: true };
      }
      if (t === "click" && step.selector) {
        const el = document.querySelector(step.selector);
        if (!el) return { ok: false, error: "selector-not-found" };
        el.scrollIntoView({ block: "center" });
        el.click();
        return { ok: true };
      }
      if (t === "type" && step.selector) {
        const el = document.querySelector(step.selector);
        if (!el) return { ok: false, error: "selector-not-found" };
        el.focus();
        if ("value" in el) {
          el.value = step.text || "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (step.enter) {
          el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
        return { ok: true };
      }
      if (t === "pressenter") {
        document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        return { ok: true };
      }
      if (t === "waitfortext" && step.text) {
        const timeout = step.timeout || 8000;
        const start = Date.now();
        while (Date.now() - start < timeout) {
          if (document.body.innerText.includes(step.text)) return { ok: true };
          await new Promise((r) => setTimeout(r, 200));
        }
        return { ok: false, error: "timeout" };
      }
      if (t === "scroll") {
        const times = step.times || 1;
        const dir = (step.direction || "down").toLowerCase();
        for (let i = 0; i < times; i++) {
          window.scrollBy({ top: dir === "up" ? -600 : 600, behavior: "smooth" });
          await new Promise((r) => setTimeout(r, 350));
        }
        return { ok: true };
      }
      if (t === "done") return { ok: true, done: true };
      return { ok: false, error: `unknown-action:${t}` };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  // ---------- Right-docked panel (Shadow DOM) ----------
  const host = document.createElement("div");
  host.id = "commet-root-host";
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.right = "0";
  host.style.width = PANEL_WIDTH;
  host.style.height = "100%";
  host.style.zIndex = "2147483647";
  document.body.appendChild(host);

  const prevPadRight = document.body.style.paddingRight;
  document.body.style.paddingRight = PANEL_WIDTH;

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    .wrap { height: 100%; background: #fff; border-left: 1px solid #e6e6e6; display: grid; grid-template-rows: auto auto auto auto 1fr; }
    .header { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#3f6efb; color:#fff; font-weight:700; }
    .drag-hint { font-size:12px; opacity:.85 }
    .close { border:0; background:#ff4d4f; color:#fff; border-radius:8px; padding:4px 10px; cursor:pointer; font-weight:800; }
    .task { padding:8px; }
    .task textarea { width:100%; height:64px; padding:12px; border:1px solid #d8d8d8; border-radius:12px; outline:none; font-size:14px; }
    /* HORIZONTAL buttons (2 columns) */
    .actions { padding:8px; display:grid; grid-template-columns: 1fr 1fr; column-gap:10px; row-gap:10px; }
    .btn { padding:10px 14px; background:#3f6efb; color:#fff; border:1px solid #3f6efb; border-radius:14px; cursor:pointer; font-weight:700; font-size:14px; }
    .btn:hover { background:#2f57d9; }
    .select-row { padding:0 8px; }
    select { width:100%; padding:10px; border:1px solid #d8d8d8; border-radius:12px; font-size:14px; }
    .bm-row { padding:8px; }
    .tabs { display:flex; gap:6px; padding:8px; }
    .tab { border:1px solid #e6e6e6; padding:6px 10px; border-radius:12px; cursor:pointer; font-weight:700; }
    .tab.active { background:#f2f6ff; border-color:#b9d1ff; color:#3f6efb; }
    .panel { border-top:1px solid #e6e6e6; margin-top:6px; height:100%; overflow:auto; padding:10px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size:12.5px; }
    .muted { color:#666; }
    .ok { color:#209361; }
    .err { color:#c62828; }
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
  shadow.append(style, root);

  // ---------- Drag vertically ----------
  (() => {
    const header = shadow.getElementById("commet-drag");
    let startY = 0, startOffset = 0, dragging = false;
    header.style.cursor = "grab";
    header.addEventListener("mousedown", (e) => {
      dragging = true; startY = e.clientY; startOffset = parseInt(host.style.top || "0", 10);
      header.style.cursor = "grabbing"; e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      const next = Math.max(0, startOffset + dy);
      host.style.top = `${next}px`;
    });
    window.addEventListener("mouseup", () => {
      dragging = false; header.style.cursor = "grab";
    });
  })();

  // ---------- Tabs ----------
  const panels = {
    log: shadow.getElementById("panel-log"),
    result: shadow.getElementById("panel-result"),
    steps: shadow.getElementById("panel-steps"),
  };
  function switchTab(name) {
    shadow.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    Object.keys(panels).forEach(k => panels[k].style.display = (k === name ? "block" : "none"));
  }
  shadow.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));

  // ---------- Logging ----------
  function logLine(html, cls = "") {
    const div = document.createElement("div");
    div.className = cls;
    div.innerHTML = html;
    panels.log.appendChild(div);
    panels.log.scrollTop = panels.log.scrollHeight;
  }
  function setResultMarkdown(mdText) {
    const html = (mdText || "")
      .replace(/^### (.*)$/gim, "<h3>$1</h3>")
      .replace(/^## (.*)$/gim, "<h2>$1</h2>")
      .replace(/^# (.*)$/gim, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br/>");
    panels.result.innerHTML = html;
    switchTab("result");
  }
  function showSteps(executed) {
    panels.steps.textContent = JSON.stringify(executed, null, 2);
  }

  // ---------- Close ----------
  shadow.getElementById("commet-close").addEventListener("click", () => {
    host.remove();
    document.body.style.paddingRight = prevPadRight;
  });

  // ---------- Button actions ----------
  const taskEl = shadow.getElementById("task");

  shadow.getElementById("btn-sum").addEventListener("click", async () => {
    const task = taskEl.value.trim() || "Summarize this page";
    logLine(`📝 Summary requested: <b>${task}</b>`);
    const snap = snapshotPage();
    try {
      const res = await callBackend("/summarize", { task, context: snap });
      setResultMarkdown(res.summary || String(res));
    } catch (e) {
      logLine(`❌ summarize error: ${String(e)}`, "err");
    }
  });

  shadow.getElementById("btn-bm").addEventListener("click", async () => {
    const bm = shadow.getElementById("bookmark").value;
    if (!bm) { logLine("⚠️ Select a bookmark first", "err"); return; }
    logLine(`🔖 Running bookmark: <b>${bm}</b>`);
    try {
      const res = await callBackend("/run_bookmark", { name: bm });
      setResultMarkdown("**Bookmark executed**<br/><br/>" + JSON.stringify(res, null, 2));
    } catch (e) {
      logLine(`❌ bookmark error: ${String(e)}`, "err");
    }
  });

  shadow.getElementById("btn-auto").addEventListener("click", async () => {
    const task = taskEl.value.trim();
    if (!task) { logLine("⚠️ Enter a task for automation", "err"); return; }
    logLine(`⚡ Automation: <b>${task}</b>`);

    const executedSteps = [];
    let snap = snapshotPage();

    let plan;
    try {
      plan = await callBackend("/plan", { prompt: task, dom: snap.controls, start_url: snap.url });
    } catch (e) {
      logLine(`❌ /plan error: ${String(e)}`, "err");
      return;
    }

    const steps = [].concat(plan?.steps || []);
    logLine(`Plan received with ${steps.length} step(s).`);

    for (const step of steps) {
      const res = await performAction(step);
      if (res.ok) {
        executedSteps.push(step);
        logLine(`✅ ${step.action} ${step.selector ? `→ <code>${step.selector}</code>` : (step.url || "")}`, "ok");
        await new Promise((r) => setTimeout(r, 700));
        snap = snapshotPage();

        try {
          const next = await callBackend("/next", { last_step: step, dom: snap.controls, current_url: snap.url, prompt: task });
          if (next?.steps?.length) {
            logLine(`➕ Planner suggested ${next.steps.length} more step(s).`);
            steps.push(...next.steps);
          }
        } catch (e) {
          logLine(`Planner /next error: ${String(e)}`, "err");
        }
      } else {
        logLine(`❌ ${step.action} failed: ${res.error || "unknown error"}`, "err");
      }
    }

    showSteps(executedSteps);
    switchTab("steps");
  });
})();
