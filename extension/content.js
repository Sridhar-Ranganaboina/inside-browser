(() => {
  // --- robust guard: if an existing panel is in DOM, just reveal it; if not, allow re-init ---
  const existingHost = document.getElementById("commet-root-host");
  if (existingHost) {
    existingHost.style.display = "block";
    existingHost.scrollIntoView({ block: "start" });
    return;
  }
  if (window.__commet_loaded__ === true && !existingHost) {
    window.__commet_loaded__ = false;
  }
  if (window.__commet_loaded__) return;
  window.__commet_loaded__ = true;

  const PANEL_WIDTH = "20vw";
  const STORAGE_KEY_OPEN = "commet_open";
  const DEFAULT_OPEN = true;

  // ---- storage wrappers (use background; content scripts can't always access storage) ----
  function getOpenFlag() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_OPEN_FLAG", defaultVal: DEFAULT_OPEN }, (resp) => {
        resolve(resp && resp.ok ? !!resp.value : DEFAULT_OPEN);
      });
    });
  }
  function setOpenFlag(val) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "SET_OPEN_FLAG", value: !!val }, () => resolve());
    });
  }

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
  function getAccessibleName(el) {
    const aria = el.getAttribute?.("aria-label");
    if (aria) return aria.trim();
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab?.innerText) return lab.innerText.trim();
    }
    const title = el.getAttribute?.("title");
    if (title) return title.trim();
    const placeholder = el.getAttribute?.("placeholder");
    if (placeholder) return placeholder.trim();
    if (el.name) return String(el.name).trim();
    const text = (el.innerText || "").trim();
    if (text) return text;
    return "";
  }
  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function scoreAgainstName(el, targetName) {
    if (!targetName) return 1;
    const n = targetName.trim().toLowerCase();
    if (!n) return 1;
    const cand = getAccessibleName(el).toLowerCase();
    if (!cand) return 0.5;
    if (cand === n) return 100;
    if (cand.startsWith(n)) return 50;
    if (cand.includes(n)) return 30;
    const a = new Set(cand.split(/\s+/));
    const b = new Set(n.split(/\s+/));
    let overlap = 0;
    b.forEach(t => { if (a.has(t)) overlap += 1; });
    return 10 + overlap;
  }
  function roleSelector(role) {
    const r = String(role || "").toLowerCase();
    switch (r) {
      case "textbox":
        return 'input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], textarea, [role="textbox"], [contenteditable="true"]';
      case "button":
        return 'button, [role="button"], input[type="button"], input[type="submit"]';
      case "link":
        return 'a[href], [role="link"]';
      case "combobox":
        return 'select, [role="combobox"], input[list]';
      case "checkbox":
        return 'input[type="checkbox"], [role="checkbox"]';
      case "radio":
        return 'input[type="radio"], [role="radio"]';
      case "listbox":
        return '[role="listbox"], select[size], ul[role="listbox"]';
      default:
        return 'a[href], button, [role="button"], input, textarea, select, [role]';
    }
  }
  function resolveByQuery(query) {
    if (!query || typeof query !== "object") return null;
    const sel = roleSelector(query.role);
    const nodes = [...document.querySelectorAll(sel)];
    let best = null;
    let bestScore = -1;
    const targetName = (query.name || "").toString().trim();
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const s = scoreAgainstName(el, targetName);
      if (s > bestScore) { best = el; bestScore = s; }
    }
    return best;
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
  function dispatchKey(el, type, key = "Enter") {
    const evt = new KeyboardEvent(type, {
      key, code: key, keyCode: 13, which: 13, bubbles: true, cancelable: true,
    });
    Object.defineProperty(evt, "keyCode", { get: () => 13 });
    Object.defineProperty(evt, "which", { get: () => 13 });
    (el || document.body).dispatchEvent(evt);
  }
  async function submitLike(el) {
    if (!el) return;
    // enter
    dispatchKey(el, "keydown");
    dispatchKey(el, "keypress");
    dispatchKey(el, "keyup");
    await new Promise(r => setTimeout(r, 50));
    // form submit
    const form = el.closest?.("form");
    if (form) {
      const btn = form.querySelector('[type="submit"], button, [role="button"]');
      if (btn && isVisible(btn)) btn.click();
      else try { form.requestSubmit ? form.requestSubmit() : form.submit(); } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    // search button fallback
    const searchBtn = document.querySelector(
      'button[aria-label*="Search"], input[type="submit"][value*="Search"], button[name="btnK"], input[name="btnK"]'
    );
    if (searchBtn && isVisible(searchBtn)) { searchBtn.click(); await new Promise(r => setTimeout(r, 200)); }
  }

  // ---------- Open panel if user left it open last time ----------
  getOpenFlag().then((open) => { if (open) mountPanel(); });

  function mountPanel() {
    if (document.getElementById("commet-root-host")) return;

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

    // --- keep key events inside the shadow so Enter doesn't bubble to page ---
    ["keydown", "keypress", "keyup"].forEach(type => {
      shadow.addEventListener(type, (e) => {
        if (e.isTrusted) e.stopPropagation(); // block site hotkeys/navigation
      }, { capture: true });
    });

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
      window.addEventListener("mouseup", () => { dragging = false; header.style.cursor = "grab"; });
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

    // ---------- Logging / rendering ----------
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

    // ---------- Close (persist closed state) ----------
    shadow.getElementById("commet-close").addEventListener("click", async () => {
      await setOpenFlag(false);
      host.remove();
      document.body.style.paddingRight = prevPadRight;
    });

    // ---------- Button actions ----------
    const taskEl = shadow.getElementById("task");

    // Enter submits automation; Shift+Enter inserts newline; block bubbling to page
    taskEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); e.stopPropagation();
        shadow.getElementById("btn-auto").click();
      } else {
        e.stopPropagation();
      }
    }, { capture: true });

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

    // ---------- Automation core ----------
    function collectSearchResults() {
      const results = [];
      document.querySelectorAll("#search a h3").forEach(h3 => {
        const a = h3.closest("a"); if (!a) return;
        const url = a.href; const title = h3.textContent.trim();
        if (url && title) results.push({ title, url });
      });
      if (!results.length) {
        document.querySelectorAll("li.b_algo h2 a").forEach(a => {
          const url = a.href, title = (a.textContent || "").trim();
          if (url && title) results.push({ title, url });
        });
      }
      if (!results.length) {
        const anchors = [...document.querySelectorAll("main a[href], body a[href]")].filter(a =>
          isVisible(a) && (a.innerText || "").trim().length > 0 && !a.href.startsWith("javascript:") && !a.href.startsWith("#")
        );
        anchors.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        const seen = new Set();
        for (const a of anchors) {
          const url = a.href; if (seen.has(url)) continue; seen.add(url);
          const title = (a.innerText || "").trim().replace(/\s+/g, " ");
          if (title) results.push({ title, url });
          if (results.length >= 10) break;
        }
      }
      return results.slice(0, 10);
    }
    function looksLikeSearchTask(t) {
      return /(^|\s)(search|find)\b/i.test(t) || /\bq=/.test(location.search);
    }
    async function performAction(step, taskHint) {
      try {
        const t = (step.action || "").toLowerCase();
        const getTarget = () => {
          if (step.selector) {
            const el = document.querySelector(step.selector);
            if (el && isVisible(el)) return el;
          }
          if (step.query) {
            const el = resolveByQuery(step.query);
            if (el) return el;
          }
          return null;
        };
        if (t === "navigate" && step.url) { window.location.href = step.url; return { ok: true }; }
        if (t === "click") {
          const el = getTarget(); if (!el) return { ok: false, error: "target-not-found" };
          el.scrollIntoView({ block: "center" }); el.click(); return { ok: true };
        }
        if (t === "type") {
          let el = getTarget() ||
                   document.querySelector('input[type="search"], input[name="q"], input[type="text"], textarea, [contenteditable="true"]');
          if (!el) return { ok: false, error: "target-not-found" };
          el.scrollIntoView({ block: "center" }); el.focus();
          if ("value" in el) {
            el.value = step.text || "";
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          } else if (el.isContentEditable) {
            el.innerText = step.text || "";
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (step.enter || looksLikeSearchTask(taskHint)) await submitLike(el);
          return { ok: true };
        }
        if (t === "pressenter") {
          const el = document.activeElement || document.body;
          dispatchKey(el, "keydown"); dispatchKey(el, "keypress"); dispatchKey(el, "keyup");
          return { ok: true };
        }
        if (t === "waitfortext" && step.text) {
          const timeout = step.timeout || 8000, start = Date.now();
          while (Date.now() - start < timeout) {
            if (document.body.innerText.includes(step.text)) return { ok: true };
            await new Promise(r => setTimeout(r, 200));
          }
          return { ok: false, error: "timeout" };
        }
        if (t === "scroll") {
          const times = step.times || 1;
          const dir = (step.direction || "down").toLowerCase();
          for (let i = 0; i < times; i++) {
            window.scrollBy({ top: dir === "up" ? -600 : 600, behavior: "smooth" });
            await new Promise(r => setTimeout(r, 350));
          }
          return { ok: true };
        }
        if (t === "done") return { ok: true, done: true };
        return { ok: false, error: `unknown-action:${t}` };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }

    shadow.getElementById("btn-auto").addEventListener("click", async () => {
      await setOpenFlag(true); // keep open across next nav
      const task = taskEl.value.trim();
      if (!task) { logLine("⚠️ Enter a task for automation", "err"); return; }
      logLine(`⚡ Automation: <b>${task}</b>`);

      const executedSteps = [];
      let snap = snapshotPage();

      let plan;
      try { plan = await callBackend("/plan", { prompt: task, dom: snap.controls, start_url: snap.url }); }
      catch (e) { logLine(`❌ /plan error: ${String(e)}`, "err"); return; }

      const steps = [].concat(plan?.steps || []);
      logLine(`Plan received with ${steps.length} step(s).`);

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const res = await performAction(step, task);
        if (res.ok) {
          executedSteps.push(step);
          const targetInfo = step.selector
            ? `→ <code>${step.selector}</code>`
            : (step.query ? `→ ${JSON.stringify(step.query)}` : (step.url || ""));
          logLine(`✅ ${step.action} ${targetInfo}`, "ok");
          await new Promise((r) => setTimeout(r, 700));
          snap = snapshotPage();

          try {
            const next = await callBackend("/next", { last_step: step, dom: snap.controls, current_url: snap.url, prompt: task });
            if (next?.steps?.length) {
              logLine(`➕ Planner suggested ${next.steps.length} more step(s).`);
              steps.push(...next.steps);
            }
          } catch (e) { logLine(`Planner /next error: ${String(e)}`, "err"); }
        } else {
          logLine(`❌ ${step.action} failed: ${res.error || "unknown error"}`, "err");
        }
      }

      if (looksLikeSearchTask(task)) {
        const items = collectSearchResults();
        if (items.length) {
          const md = "### Top results\n\n" + items.map((it, idx) => `${idx + 1}. [${it.title}](${it.url})`).join("\n");
          setResultMarkdown(md);
        }
      }
      showSteps(executedSteps);
      switchTab("steps");
    });
  }

  // ---- Re-mount if SPA wipes host; also support toolbar icon open ----
  const obs = new MutationObserver(() => {
    if (!document.getElementById("commet-root-host")) {
      getOpenFlag().then((open) => { if (open) mountPanel(); });
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // From background (toolbar icon click)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "OPEN_PANEL") {
      setOpenFlag(true).then(() => mountPanel());
    }
  });
})();
