// extension/content.js
(() => {
  // ===========================
  // Single-inject guard
  // ===========================
  const existingHost = document.getElementById("commet-root-host");
  if (existingHost) {
    existingHost.style.display = "block";
    existingHost.scrollIntoView({ block: "start" });
  }
  if (window.__commet_loaded__ === true && !existingHost) window.__commet_loaded__ = false;
  if (window.__commet_loaded__) return;
  window.__commet_loaded__ = true;

  // Expose shadow root when mounted (for optional UI updates from performAction)
  let __shadow = null;

  // ===========================
  // Constants
  // ===========================
  const PANEL_WIDTH = "20vw";
  const DEFAULT_OPEN = true;
  const MAX_TEXT = 20000;

  // ===========================
  // Background bridges (state & backend)
  // ===========================
  function getState() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_STATE" }, (resp) => {
        resolve(resp && resp.ok ? (resp.state || {}) : {});
      });
    });
  }
  function setState(patch) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "SET_STATE", patch }, () => resolve());
    });
  }
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
  function callBackend(path, body) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "BACKEND_FETCH", path, method: "POST", body },
        (resp) => {
          if (chrome.runtime.lastError) { reject(chrome.runtime.lastError.message); return; }
          if (resp?.ok) resolve(resp.data);
          else reject(resp?.error || `backend_error_${resp?.status || "unknown"}`);
        }
      );
    });
  }

  // ===========================
  // DOM utils (top-level so GET_SNAPSHOT works even if panel isn't mounted)
  // ===========================
  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    if (el.id) return `#${CSS.escape(el.id)}`;
    const path = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      let sel = el.nodeName.toLowerCase();
      if (el.classList.length) sel += "." + [...el.classList].map(c => CSS.escape(c)).join(".");
      const parent = el.parentElement;
      if (parent) {
        const sibs = [...parent.children].filter(n => n.nodeName === el.nodeName);
        if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(el) + 1})`;
      }
      path.unshift(sel);
      el = el.parentElement;
    }
    return path.join(" > ");
  }
  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
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
      default:
        return 'a[href], button, input, textarea, select, [role]';
    }
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
    const txt = (el.innerText || "").trim();
    return txt || "";
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
    const A = new Set(cand.split(/\s+/));
    const B = new Set(n.split(/\s+/));
    let overlap = 0;
    B.forEach(t => { if (A.has(t)) overlap += 1; });
    return 10 + overlap;
  }
  function resolveByQuery(query) {
    if (!query || typeof query !== "object") return null;
    const sel = roleSelector(query.role);
    const nodes = [...document.querySelectorAll(sel)];
    let best = null, bestScore = -1;
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
    const links = controls
      .filter(c => c.tag === "a" && c.href)
      .map(c => {
        try { return new URL(c.href, location.href).href; } catch { return null; }
      })
      .filter(Boolean);
    return {
      url: location.href,
      title: document.title,
      origin: location.origin,
      controls,
      links: [...new Set(links)].slice(0, 200)
    };
  }
  function extractReadableText(maxChars = MAX_TEXT) {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll(
      "script,style,noscript,svg,canvas,iframe,nav,footer,aside,form,button,menu,dialog"
    ).forEach(n => n.remove());
    const main = clone.querySelector("main,[role=main],article") || clone;
    let text = (main.innerText || "")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (text.length > maxChars) text = text.slice(0, maxChars) + " …";
    return text;
  }
  function extractHeadings(limit = 40) {
    return [...document.querySelectorAll("h1,h2,h3")]
      .map(h => (h.innerText || "").trim())
      .filter(Boolean)
      .slice(0, limit);
  }
  function collectTopResultsMarkdown() {
    const h = extractHeadings(10);
    const links = [...document.querySelectorAll("a[href]")]
      .filter(a => isVisible(a))
      .slice(0, 10)
      .map((a, i) => `${i + 1}. [${(a.innerText || a.title || a.href).trim().slice(0, 120) || a.href}](${a.href})`)
      .join("\n");
    const headBlock = h.length ? `### Top headings\n- ${h.join("\n- ")}\n\n` : "";
    return `## ${document.title || "Page"}\n\n${headBlock}${links ? "### Top results\n" + links : ""}`;
  }

  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  function measureDom() { return { url: location.href, len: document.body ? document.body.innerHTML.length : 0 }; }
  async function waitForDomChange(prev, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await wait(250);
      const cur = measureDom();
      if (cur.url !== prev.url) return { didNavigate: true, domChanged: true };
      if (Math.abs(cur.len - prev.len) > 800 || Math.abs(cur.len - prev.len) / Math.max(prev.len || 1, 1) > 0.2) {
        return { didNavigate: false, domChanged: true };
      }
    }
    return { didNavigate: false, domChanged: false };
  }
  async function waitForPageSettled(timeout = 12000) {
    const start = Date.now();
    while (document.readyState !== "complete" && Date.now() - start < timeout) await wait(120);
    let last = document.body ? document.body.innerHTML.length : 0;
    let stable = 0;
    while (Date.now() - start < timeout) {
      await wait(300);
      const cur = document.body ? document.body.innerHTML.length : 0;
      if (cur === last) { stable += 1; if (stable >= 2) break; }
      else { stable = 0; last = cur; }
    }
  }
  async function waitForText(txt, timeout = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if ((document.body?.innerText || "").includes(txt)) return true;
      await wait(250);
    }
    return false;
  }

  // ===========================
  // TOP-LEVEL message handlers (always on)
  // ===========================
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      try {
        if (msg?.type === "GET_SNAPSHOT") {
          const snap = snapshotPage();
          sendResponse({ ok: true, snapshot: snap });
          return;
        }
        if (msg?.type === "PERFORM_ACTION") {
          const r = await performAction(msg.action);
          sendResponse(r);
          return;
        }
        if (msg?.type === "OPEN_PANEL") {
          await setOpenFlag(true);
          mountPanel(); // (idempotent)
          sendResponse({ ok: true });
          return;
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  });

  // Auto-open on load depending on flag
  getOpenFlag().then((open) => { if (open) mountPanel(); });

  // ===========================
  // UI panel
  // ===========================
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
    __shadow = shadow; // store globally for optional UI updates

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
      .wrap { height: 100%; background: #fff; border-left: 1px solid #e6e6e6;
              display: grid; grid-template-rows: auto auto auto auto auto auto 1fr; }
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

    // prevent site hotkeys from stealing Enter, etc.
    ["keydown","keypress","keyup"].forEach(type => {
      shadow.addEventListener(type, (e) => { if (e.isTrusted) e.stopPropagation(); }, { capture: true });
    });

    // drag
    (() => {
      const header = shadow.getElementById("commet-drag");
      let startY = 0, startTop = 0, dragging = false;
      header.style.cursor = "grab";
      header.addEventListener("mousedown", (e) => {
        dragging = true; startY = e.clientY; startTop = parseInt(host.style.top || "0", 10);
        header.style.cursor = "grabbing"; e.preventDefault();
      });
      window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const dy = e.clientY - startY;
        host.style.top = `${Math.max(0, startTop + dy)}px`;
      });
      window.addEventListener("mouseup", () => { dragging = false; header.style.cursor = "grab"; });
    })();

    // tabs
    const panels = {
      log: shadow.getElementById("panel-log"),
      result: shadow.getElementById("panel-result"),
      steps: shadow.getElementById("panel-steps"),
    };
    function switchTab(name) {
      shadow.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
      Object.keys(panels).forEach(k => panels[k].style.display = (k === name ? "block" : "none"));
      setState({ activeTab: name }).catch(() => {});
    }
    shadow.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));

    const taskEl = shadow.getElementById("task");
    const bookmarkEl = shadow.getElementById("bookmark");
    function savePanels() {
      setState({
        prompt: taskEl.value,
        logHTML: panels.log.innerHTML,
        resultHTML: panels.result.innerHTML,
        stepsJSON: panels.steps.textContent,
        bookmark: bookmarkEl.value
      }).catch(() => {});
    }
    function logLine(html, cls = "") {
      const div = document.createElement("div");
      div.className = cls;
      div.innerHTML = html;
      panels.log.appendChild(div);
      panels.log.scrollTop = panels.log.scrollHeight;
      if (panels.log.textContent.length > 200000) panels.log.innerHTML = panels.log.innerHTML.slice(-100000);
      savePanels();
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
      savePanels();
    }
    function showSteps(executed) {
      panels.steps.textContent = JSON.stringify(executed, null, 2);
      savePanels();
    }

    shadow.getElementById("commet-close").addEventListener("click", async () => {
      await setOpenFlag(false);
      host.remove();
      document.body.style.paddingRight = prevPadRight;
      __shadow = null;
    });

    taskEl.addEventListener("input", savePanels);
    bookmarkEl.addEventListener("change", savePanels);

    taskEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); e.stopPropagation();
        shadow.getElementById("btn-auto").click();
      } else { e.stopPropagation(); }
    }, { capture: true });

    // Summarize
    shadow.getElementById("btn-sum").addEventListener("click", async () => {
      const task = taskEl.value.trim() || "Summarize this page";
      const snap = snapshotPage();
      const text = extractReadableText(MAX_TEXT);
      const headings = extractHeadings(40);

      logLine(`📝 Summarize requested for: <b>${snap.title || snap.url}</b>`);
      switchTab("result");
      setResultMarkdown("_Summarizing…_");

      try {
        const data = await callBackend("/summarize", {
          task,
          context: { url: snap.url, title: snap.title, text, headings, dom: snap.controls.slice(0, 200) }
        });
        setResultMarkdown(data.summary || String(data));
      } catch (e) {
        setResultMarkdown("**Summary failed**<br/><br/>" + String(e));
      }
    });

    // Bookmarks
    shadow.getElementById("btn-bm").addEventListener("click", async () => {
      const bm = bookmarkEl.value;
      if (!bm) { logLine("⚠️ Select a bookmark first", "err"); return; }
      logLine(`🔖 Running bookmark: <b>${bm}</b>`);
      try {
        const res = await callBackend("/run_bookmark", { name: bm });
        setResultMarkdown("**Bookmark executed**<br/><br/>" + JSON.stringify(res, null, 2));
      } catch (e) { logLine(`❌ bookmark error: ${String(e)}`, "err"); }
    });

    // Automation
    shadow.getElementById("btn-auto").addEventListener("click", async () => {
      const prompt = taskEl.value.trim();
      if (!prompt) { logLine("⚠️ Enter a task first", "err"); return; }
      await setState({ prompt });
      await setOpenFlag(true);
      logLine(`⚡ Automation: <b>${prompt}</b>`);
      switchTab("log");

      chrome.runtime.sendMessage({ type: "START_AUTOMATION", prompt }, (resp) => {
        if (!resp?.ok) logLine("❌ failed to start automation", "err");
      });
    });

    // Restore
    getState().then((st) => {
      if (st) {
        if (typeof st.prompt === "string") taskEl.value = st.prompt;
        if (typeof st.bookmark === "string") bookmarkEl.value = st.bookmark;
        if (typeof st.logHTML === "string") panels.log.innerHTML = st.logHTML;
        if (typeof st.resultHTML === "string") panels.result.innerHTML = st.resultHTML;
        if (typeof st.stepsJSON === "string") panels.steps.textContent = st.stepsJSON;
        switchTab(st.activeTab || "log");
        panels.log.scrollTop = panels.log.scrollHeight;
      }
    });

    // Provide small helpers for performAction UI updates
    window.__commet_ui__ = {
      setResultMarkdown: (md) => setResultMarkdown(md),
      appendExecutedStep: (step) => {
        try {
          const current = panels.steps.textContent ? JSON.parse(panels.steps.textContent) : [];
          current.push(step);
          panels.steps.textContent = JSON.stringify(current, null, 2);
          savePanels();
        } catch {
          panels.steps.textContent = JSON.stringify([step], null, 2);
          savePanels();
        }
      }
    };
  } // mountPanel

  // Re-mount panel if SPA re-renders / after nav (when flag says open)
  const obs = new MutationObserver(() => {
    if (!document.getElementById("commet-root-host")) {
      getOpenFlag().then((open) => { if (open) mountPanel(); });
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // ===========================
  // Action execution (top-level so works even if panel not mounted)
  // ===========================
  async function performAction(action) {
    try {
      if (!action || !action.action) return { ok: false, error: "invalid action" };

      const findTarget = () => {
        if (action.selector) {
          const el = document.querySelector(action.selector);
          if (el && isVisible(el)) return el;
        }
        if (action.query) {
          const el = resolveByQuery(action.query);
          if (el && isVisible(el)) return el;
        }
        return null;
      };

      const before = { url: location.href, len: document.body ? document.body.innerHTML.length : 0 };

      switch (action.action) {
        case "navigate": {
          const u = action.url || "";
          if (!u) return { ok: false, error: "missing-url" };
          location.href = u;
          return { ok: true, didNavigate: true, domChanged: true };
        }
        case "click": {
          const el = findTarget();
          if (!el) return { ok: false, error: "selector-not-found" };
          el.scrollIntoView({ block: "center", inline: "center" });
          el.click();
          const changed = await waitForDomChange(before, 8000);
          if (changed.didNavigate && window.__commet_ui__) {
            await waitForPageSettled(12000);
            window.__commet_ui__.setResultMarkdown(collectTopResultsMarkdown());
          }
          if (window.__commet_ui__ && changed) window.__commet_ui__.appendExecutedStep(action);
          return { ok: true, ...changed };
        }
        case "type": {
          const el = findTarget() || document.activeElement;
          if (!el) return { ok: false, error: "selector-not-found" };
          el.focus();
          if ("value" in el) {
            el.value = action.text || "";
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          } else if (el.getAttribute && el.getAttribute("contenteditable") === "true") {
            el.innerText = action.text || "";
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (action.enter === true) {
            ["keydown","keypress","keyup"].forEach(type => {
              el.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", which: 13, keyCode: 13, bubbles: true }));
            });
            try { if (el.form) el.form.submit(); } catch {}
            const changed = await waitForDomChange(before, 10000);
            if (changed.didNavigate && window.__commet_ui__) {
              await waitForPageSettled(12000);
              window.__commet_ui__.setResultMarkdown(collectTopResultsMarkdown());
            }
            if (window.__commet_ui__ && changed) window.__commet_ui__.appendExecutedStep(action);
            return { ok: true, ...changed };
          }
          if (window.__commet_ui__) window.__commet_ui__.appendExecutedStep(action);
          return { ok: true, didNavigate: false, domChanged: false };
        }
        case "pressEnter": {
          const el = document.activeElement || document.body;
          ["keydown","keypress","keyup"].forEach(type => {
            el.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", which: 13, keyCode: 13, bubbles: true }));
          });
          const changed = await waitForDomChange(before, 10000);
          if (changed.didNavigate && window.__commet_ui__) {
            await waitForPageSettled(12000);
            window.__commet_ui__.setResultMarkdown(collectTopResultsMarkdown());
          }
          if (window.__commet_ui__ && changed) window.__commet_ui__.appendExecutedStep(action);
          return { ok: true, ...changed };
        }
        case "scroll": {
          const times = action.times || 1;
          for (let i = 0; i < times; i++) {
            window.scrollBy(0, action.direction === "up" ? -600 : 600);
            await wait(350);
          }
          const changed = await waitForDomChange(before, 1500);
          if (window.__commet_ui__ && changed) window.__commet_ui__.appendExecutedStep(action);
          return { ok: true, ...changed };
        }
        case "waitForText": {
          const ok = await waitForText(action.text || "", action.timeout || 8000);
          const changed = ok ? { didNavigate: false, domChanged: true } : { didNavigate: false, domChanged: false };
          if (window.__commet_ui__) window.__commet_ui__.appendExecutedStep(action);
          return ok ? { ok: true, ...changed } : { ok: false, error: "wait-timeout", ...changed };
        }
        case "done":
          if (window.__commet_ui__) window.__commet_ui__.appendExecutedStep(action);
          return { ok: true, done: true, didNavigate: false, domChanged: false };
        default:
          return { ok: false, error: "unknown-action" };
      }
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  // ===========================
// Re-mount panel when needed (guarded; singleton)
// ===========================
if (!window.__commet_obs__) {
  window.__commet_obs__ = new MutationObserver(() => {
    if (!document.getElementById("commet-root-host")) {
      getOpenFlag().then((open) => { if (open) mountPanel(); });
    }
  });
  window.__commet_obs__.observe(document.documentElement, { childList: true, subtree: true });
}
})();
