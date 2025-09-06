// MV3 service worker (module)
const BACKEND_BASE = "http://localhost:8000"; // <— change if needed

// In-memory per-tab state (so we don't rely on chrome.storage on restricted pages)
const stateByTab = new Map();
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

async function backend(path, payload) {
  const res = await fetch(BACKEND_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${JSON.stringify(data)}`);
  }
  return data;
}

// Helpers to talk to content script in a specific tab
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
    } catch (e) {
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

// ---------- NEW: small helpers to stop loops ----------
function stepKey(s) {
  return JSON.stringify({
    action: s?.action || "",
    selector: s?.selector || null,
    query: s?.query || null,
    text: s?.text || null,
    url: s?.url || null,
  });
}

function snapshotSig(snap) {
  if (!snap) return "none";
  const head = (snap.controls || [])
    .slice(0, 30)
    .map(c => `${c.tag}|${c.role}|${(c.name||"").slice(0,40)}|${(c.text||"").slice(0,40)}`)
    .join("|");
  return `${snap.url}::${head}`;
}
// ------------------------------------------------------

// Main automation loop
async function runAutomation(tabId, prompt) {
  if (!tabId) tabId = await getActiveTabId();
  if (!tabId) throw new Error("no active tab");

  // Ask content for initial snapshot
  const snap = await getSnapshot(tabId);
  if (!snap) throw new Error("no snapshot from content script");

  let prevSig = snapshotSig(snap);
  const seenSteps = new Set();

  // Plan
  const plan = await backend("/plan", {
    prompt,
    dom: snap.controls || [],
    start_url: snap.url || null,
  });

  let steps = (plan && plan.steps) ? plan.steps.filter(s => {
    const k = stepKey(s); if (seenSteps.has(k)) return false; seenSteps.add(k); return true;
  }) : [];
  let guard = 0;
  let pressedEnterFallback = false; // only synthesize once per run

  while (steps.length && guard < 50) {
    const step = steps.shift();

    // Execute one action in tab
    const r = await performAction(tabId, step);
    await new Promise(r => setTimeout(r, 900)); // small settle time

    // Take fresh snapshot
    const snap2 = await getSnapshot(tabId);
    const curSig = snapshotSig(snap2);

    // Optional: seed explorer (non-blocking)
    try {
      await backend("/explore", {
        current_url: snap2?.url || snap?.url || "",
        links: snap2?.links || [],
      });
    } catch (_) {}

    // Ask backend for next steps based on latest DOM
    let nextSteps = [];
    try {
      const next = await backend("/next", {
        last_step: step,
        dom: snap2?.controls || [],
        current_url: snap2?.url || "",
        prompt,
      });
      if (next && Array.isArray(next.steps)) nextSteps = next.steps;
    } catch (_) {
      // keep going with remaining local steps
    }

    // ---- LOOP FIXES ----
    // 1) De-duplicate steps we've already executed/queued
    nextSteps = nextSteps.filter(s => {
      const k = stepKey(s);
      if (seenSteps.has(k)) return false;
      seenSteps.add(k);
      return true;
    });

    // 2) If page signature did NOT change and last step was "type",
    //    and planner keeps suggesting the same "type", drop them and
    //    synthesize a pressEnter once to move forward.
    const lastWasType = step?.action === "type";
    const noPageChange = curSig === prevSig;

    if (lastWasType && noPageChange) {
      // Remove repetitive type steps (same target/text)
      nextSteps = nextSteps.filter(s => !(s.action === "type" && stepKey(s) === stepKey(step)));

      if (!pressedEnterFallback && !nextSteps.length) {
        // Push a single Enter keypress to try to submit searches/forms
        nextSteps.push({ action: "pressEnter" });
        pressedEnterFallback = true;
      }
    }
    // --------------------

    // Prepend new steps (depth-first-ish)
    if (nextSteps.length) {
      steps = nextSteps.concat(steps);
    }

    if (step.action === "done") break;

    // advance signature window & guard
    prevSig = curSig;
    guard++;
  }
}

// Toolbar click → open the in-page panel (works on most pages; chrome:// pages are blocked)
chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab?.id;
  if (!tabId) return;
  const st = getTabState(tabId);
  st.open = true;
  try {
    await sendToTab(tabId, { type: "OPEN_PANEL" });
  } catch (_) {}
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

        // CORS-safe backend fetch for the panel (summarize button)
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
          // ensure panel stays open across nav
          const st = getTabState(tabId); st.open = true;

          runAutomation(tabId, p)
            .then(() => sendResponse({ ok: true }))
            .catch(err => { console.error(err); sendResponse({ ok: false, error: String(err) }); });
          return; // keep message channel open
        }
        default:
          sendResponse({ ok: false, error: "unknown-message" });
          return;
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  // Indicate async response
  return true;
});
