// extension/bg/index.js
import { MSG } from "../common/messages.js";
import { BACKEND_BASE, MAX_TOTAL_ACTIONS, DEDUPE_TTL_MS } from "./constants.js";

// ---------------------------- per-tab state ----------------------------
const tabState = new Map();
const runningTabs = new Set();

function state(tabId) {
  if (!tabState.has(tabId)) {
    tabState.set(tabId, {
      open: true,
      prompt: "",
      logHTML: "",
      resultHTML: "",
      stepsJSON: "",
      bookmark: "",
      activeTab: "log",
    });
  }
  return tabState.get(tabId);
}

// ------------------------------ backend -------------------------------
async function backend(path, payload) {
  const res = await fetch(BACKEND_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${JSON.stringify(data)}`);
  return data;
}

// ----------------------------- tab helpers ----------------------------
const safeTabId = (sender) => (sender && typeof sender.tab?.id === "number") ? sender.tab.id : null;
function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    try { chrome.tabs.sendMessage(tabId, msg, (resp) => resolve(resp)); }
    catch { resolve(undefined); }
  });
}
async function getActiveTabId() {
  const tabs = await chrome.tabs.query({active:true,currentWindow:true});
  return tabs && tabs[0] ? tabs[0].id : undefined;
}
async function getSnapshot(tabId) {
  const resp = await sendToTab(tabId, { type: MSG.GET_SNAPSHOT });
  return resp?.snapshot || null;
}
async function performAction(tabId, action) {
  const resp = await sendToTab(tabId, { type: MSG.PERFORM_ACTION, action });
  return resp || { ok: false, error: "no-response" };
}

// ----------------------- streaming to the panel -----------------------
function stream(tabId, htmlOrText, cls="") {
  const payload = typeof htmlOrText === "string"
    ? { html: htmlOrText, cls }
    : htmlOrText;
  chrome.tabs.sendMessage(tabId, { type: MSG.AUTOMATION_EVENT, ...payload });
}
function pushSteps(tabId, stepsArr) {
  chrome.tabs.sendMessage(tabId, { type: MSG.AUTOMATION_STEPS, steps: stepsArr });
}

// --------- step fixer (de-loop + friendlier defaults) -----------------
function rewriteStepForPage(step, snapshot) {
  const url = snapshot?.url || "";
  const s = { ...step, query: step.query ? { ...step.query } : null };

  // Prefer textboxes for typing even if LLM said "combobox"
  if (s.action === "type" && s.query?.role === "combobox") s.query.role = "textbox";

  // Amazon: avoid clicking the category dropdown when planner says "combobox Search"
  if (s.action === "click" && s.query?.role === "combobox" && /amazon\./i.test(url)) {
    s.query.role = "textbox";
  }
  return s;
}

// --------------------------- automation loop --------------------------
async function runAutomation(tabId, prompt) {
  if (!tabId) tabId = await getActiveTabId();
  if (!tabId) throw new Error("no active tab");
  if (runningTabs.has(tabId)) return;

  runningTabs.add(tabId);
  try {
    // Ping to ensure content is alive (and panel can answer)
    await sendToTab(tabId, { type: MSG.PING_CONTENT });

    const snap0 = await getSnapshot(tabId);
    stream(tabId, `⚡ <b>Automation:</b> ${escapeHtml(prompt)}`);

    const plan = await backend("/plan", {
      prompt,
      dom: snap0?.controls || [],
      start_url: snap0?.url || null,
    });

    let queue = Array.isArray(plan?.steps) ? [...plan.steps] : [];
    pushSteps(tabId, queue);

    const executed = [];
    const recent = []; // [signature, timestamp]
    let safety = 0;

    while (queue.length && safety < MAX_TOTAL_ACTIONS) {
      let step = queue.shift();
      step = rewriteStepForPage(step, snap0);

      // After type -> inject Enter if not present (helps Google/Amazon submit)
      if (step.action === "type") {
        const next = queue[0];
        if (!(next && next.action === "pressEnter")) queue.unshift({ action: "pressEnter" });
      }

      // Dedup in a small sliding window (avoid type+enter ping-pong)
      const sig = JSON.stringify([step.action, step.selector || step.query?.name || "", step.text || ""]);
      const now = Date.now();
      for (let i = recent.length - 1; i >= 0; i--) if (now - recent[i][1] > DEDUPE_TTL_MS) recent.splice(i, 1);
      if (recent.some(([s]) => s === sig)) { stream(tabId, `⚠️ Skipped duplicate step`, "muted"); continue; }
      recent.push([sig, now]);

      // Execute
      stream(tabId, `✅ ${describeStep(step)}`);
      const r = await performAction(tabId, step);
      if (!r?.ok) stream(tabId, `❌ action failed: <i>${escapeHtml(r?.error || "unknown")}</i>`, "err");
      else executed.push(step);

      // Refresh snapshot and emit readable steps (executed + remaining)
      const snap = await getSnapshot(tabId);
      pushSteps(tabId, executed.concat(queue));

      // Ask backend for the next micro-plan
      try {
        const next = await backend("/next", {
          last_step: step,
          dom: snap?.controls || [],
          current_url: snap?.url || "",
          prompt,
        });
        if (next?.steps?.length) {
          queue = next.steps.concat(queue);
          pushSteps(tabId, executed.concat(queue));
        }
      } catch {}

      if (step.action === "done") break;
      safety++;
    }
  } finally {
    runningTabs.delete(tabId);
  }
}

// -------------------------- toolbar click -----------------------------
chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab?.id;
  if (!tabId) return;
  state(tabId).open = true;
  try { await sendToTab(tabId, { type: MSG.OPEN_PANEL }); } catch {}
});

// --------------------------- message bridge ---------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const tabId = safeTabId(sender) || (await getActiveTabId());
    try {
      switch (msg?.type) {
        // Panel state
        case MSG.GET_STATE:  sendResponse({ ok:true, state: state(tabId) }); return;
        case MSG.SET_STATE:  Object.assign(state(tabId), msg.patch||{}); sendResponse({ ok:true }); return;
        case MSG.GET_OPEN_FLAG: {
          const st = state(tabId); const def = !!msg.defaultVal;
          sendResponse({ ok:true, value: typeof st.open==="boolean" ? st.open : def }); return;
        }
        case MSG.SET_OPEN_FLAG: state(tabId).open = !!msg.value; sendResponse({ ok:true }); return;

        // CORS-safe backend fetch
        case MSG.BACKEND_FETCH: {
          try { const data = await backend(msg.path, msg.body||{}); sendResponse({ ok:true, data }); }
          catch (e) { sendResponse({ ok:false, error:String(e) }); }
          return;
        }

        // Start automation
        case MSG.START_AUTOMATION: {
          const p = (msg.prompt||"").trim();
          if (!p) { sendResponse({ ok:false, error:"empty prompt" }); return; }
          state(tabId).open = true;
          runAutomation(tabId, p)
            .then(()=> sendResponse({ ok:true }))
            .catch(err => { console.error(err); sendResponse({ ok:false, error:String(err) }); });
          return; // async
        }

        case MSG.PING_CONTENT: sendResponse({ ok:true }); return;

        default: sendResponse({ ok:false, error:"unknown-message" }); return;
      }
    } catch (e) {
      sendResponse({ ok:false, error:String(e) });
    }
  })();
  return true;
});

// ------------------------------ helpers -------------------------------
function escapeHtml(s="") {
  return s.replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function describeStep(step) {
  const q = step.query ? ` {role:${step.query.role||"-"}, name:${step.query.name||"-"}}` : "";
  const t = step.text ? ` "${step.text}"` : "";
  if (step.action === "type") return `type${t}${q}`;
  if (step.action === "click") return `click${q}`;
  if (step.action === "navigate") return `navigate to ${step.url||""}`;
  if (step.action === "pressEnter") return `press Enter`;
  if (step.action === "waitForText") return `waitForText "${step.text||""}"`;
  if (step.action === "scroll") return `scroll ${step.direction||"down"}`;
  if (step.action === "done") return `done`;
  return step.action;
}
