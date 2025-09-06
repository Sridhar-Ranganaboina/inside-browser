// MV3 service worker (ES module)
const BACKEND_BASE = "http://localhost:8000";  // adjust if needed

// -------- config --------
const MAX_TOTAL_ACTIONS = 40;    // circuit breaker
const ENABLE_EXPLORE = true;     // flip off if you don't want /explore calls
const NEXT_DELAY_MS = 900;       // small wait after each action

// -------- per-tab state (in-memory, not chrome.storage) --------
const stateByTab = new Map();   // tabId -> persisted panel state (prompt, logHTML, etc.)
const openFlag = new Map();     // tabId -> boolean (keep panel open across navigations)
const runningTabs = new Set();  // tabIds currently executing automation

function getTabState(tabId) {
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

// -------- backend bridge (CORS-safe from service worker) --------
async function backend(path, payload) {
  const res = await fetch(BACKEND_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${JSON.stringify(data)}`);
  return data;
}

// -------- tab helpers --------
function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0].id : undefined);
    });
  });
}
function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (resp) => resolve(resp));
    } catch {
      resolve(undefined);
    }
  });
}
async function getSnapshot(tabId) {
  const resp = await sendToTab(tabId, { type: "GET_SNAPSHOT" });
  return resp && resp.snapshot ? resp.snapshot : null;
}
async function performAction(tabId, action) {
  const resp = await sendToTab(tabId, { type: "PERFORM_ACTION", action });
  return resp || { ok: false, error: "no-response" };
}
async function appendLog(tabId, html, cls) {
  await sendToTab(tabId, { type: "APPEND_LOG", html, cls });
}

// Small utility to guard sending to content after bfcache / navigation.
async function pingContent(tabId) {
  const resp = await sendToTab(tabId, { type: "PING_CONTENT" });
  return resp && resp.ok === true;
}

// -------- action signatures for de-dupe --------
function normStep(s) {
  return {
    action: s.action,
    selector: s.selector || null,
    query: s.query
      ? { role: (s.query.role || "").toLowerCase(), name: (s.query.name || "").toLowerCase() }
      : null,
    text: (s.text || "").trim().toLowerCase(),
    url: s.url || null,
    enter: !!s.enter,
  };
}
function stepSig(s, pageUrl) {
  let host = "";
  try { host = new URL(pageUrl || location.href).host; } catch {}
  return JSON.stringify({ n: normStep(s), host });
}

// -------- main automation loop --------
async function runAutomation(tabId, prompt) {
  if (!tabId) tabId = await getActiveTabId();
  if (!tabId) throw new Error("no active tab");
  if (runningTabs.has(tabId)) return;      // already running
  runningTabs.add(tabId);

  try {
    // Make sure the content script/panel is alive
    const alive = await pingContent(tabId);
    if (!alive) await appendLog(tabId, "⚠️ Panel is not ready in this tab.", "err");

    const snap = await getSnapshot(tabId);
    if (!snap) throw new Error("no snapshot from content script");

    // Get initial plan
    const plan = await backend("/plan", {
      prompt,
      dom: snap.controls || [],
      start_url: snap.url || null,
    });

    let queue = Array.isArray(plan?.steps) ? [...plan.steps] : [];
    let guard = 0;

    // Remember recently executed actions to avoid repetition loops
    const recentSigs = new Set();   // sliding window
    const maxRecent = 12;

    if (queue.length) {
      await appendLog(tabId, `✅ Plan received with <b>${queue.length}</b> step(s).`);
    } else {
      await appendLog(tabId, "⚠️ Planner returned 0 steps.", "err");
    }

    let lastSnapshot = snap;

    while (queue.length && guard < MAX_TOTAL_ACTIONS) {
      const step = queue.shift();

      // de-dupe: skip if we've very recently executed exactly this on the same page
      const sigBefore = stepSig(step, lastSnapshot?.url);
      if (recentSigs.has(sigBefore)) {
        await appendLog(tabId, "⏭️ Skipping repeated step.", "muted");
      } else {
        // Execute
        const r = await performAction(tabId, step);
        if (!r || r.ok !== true) {
          await appendLog(tabId, `❌ action failed: <span class="err">${(r && r.error) || "unknown"}</span>`, "err");
        }
      }

      // track signature
      recentSigs.add(sigBefore);
      if (recentSigs.size > maxRecent) {
        // drop oldest – quick way: recreate set from last N keys
        const arr = Array.from(recentSigs).slice(-maxRecent);
        recentSigs.clear(); arr.forEach(k => recentSigs.add(k));
      }

      // small settle time
      await new Promise(r => setTimeout(r, NEXT_DELAY_MS));

      // fresh snapshot (page may have changed)
      const snap2 = await getSnapshot(tabId);
      if (snap2) lastSnapshot = snap2;

      // Optionally send discovered links to explorer (non-blocking)
      if (ENABLE_EXPLORE && snap2) {
        backend("/explore", {
          current_url: snap2.url || snap.url || "",
          links: snap2.links || [],
        }).catch(() => {});
      }

      // Ask backend for next short batch
      let next = null;
      try {
        next = await backend("/next", {
          last_step: step,
          dom: snap2?.controls || [],
          current_url: snap2?.url || "",
          prompt,
        });
      } catch (e) {
        // ignore and continue remaining queue
      }

      if (Array.isArray(next?.steps) && next.steps.length) {
        // filter out repeats we just executed
        const filtered = next.steps.filter(ns => !recentSigs.has(stepSig(ns, snap2?.url)));
        if (filtered.length) {
          await appendLog(tabId, `➕ Planner suggested <b>${filtered.length}</b> more step(s).`);
          // Prepend to behave like depth-first but without loops
          queue = filtered.concat(queue);
        } else {
          await appendLog(tabId, `ℹ️ Planner suggested steps already executed; ignoring.`, "muted");
        }
      }

      if (step.action === "done") break;
      guard++;
    }

    await appendLog(tabId, `🏁 Automation complete (executed ≈ ${guard} step(s)).`, "ok");
  } finally {
    runningTabs.delete(tabId);
  }
}

// Toolbar click → open the in-page panel
chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab?.id;
  if (!tabId) return;
  const st = getTabState(tabId);
  st.open = true;
  await sendToTab(tabId, { type: "OPEN_PANEL" });
});

// Message bridge (panel ↔ background ↔ backend)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const tabId = sender?.tab?.id || (await getActiveTabId());

    try {
      switch (msg?.type) {
        // Panel state
        case "GET_STATE": {
          const st = getTabState(tabId);
          sendResponse({ ok: true, state: st });
          return;
        }
        case "SET_STATE": {
          const st = getTabState(tabId);
          Object.assign(st, msg.patch || {});
          sendResponse({ ok: true });
          return;
        }
        case "GET_OPEN_FLAG": {
          const st = getTabState(tabId);
          const def = !!msg.defaultVal;
          sendResponse({ ok: true, value: typeof st.open === "boolean" ? st.open : def });
          return;
        }
        case "SET_OPEN_FLAG": {
          const st = getTabState(tabId);
          st.open = !!msg.value;
          sendResponse({ ok: true });
          return;
        }

        // CORS-safe backend fetch for Summarize / Bookmarks
        case "BACKEND_FETCH": {
          try {
            const data = await backend(msg.path, msg.body || {});
            sendResponse({ ok: true, data });
          } catch (e) {
            sendResponse({ ok: false, error: String(e) });
          }
          return;
        }

        // Start automation from the panel
        case "START_AUTOMATION": {
          const p = (msg.prompt || "").trim();
          if (!p) { sendResponse({ ok: false, error: "empty prompt" }); return; }
          const st = getTabState(tabId); st.open = true; // keep panel open across nav
          runAutomation(tabId, p)
            .then(() => sendResponse({ ok: true }))
            .catch(err => { console.error(err); sendResponse({ ok: false, error: String(err) }); });
          return; // async
        }

        default:
          sendResponse({ ok: false, error: "unknown-message" });
          return;
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true; // respond asynchronously
});
