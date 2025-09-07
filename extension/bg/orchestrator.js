// bg/orchestrator.js
import { backend } from "./api.js";
import { getSnapshot, performAction } from "./tabs.js";
import { MAX_TOTAL_ACTIONS, DEDUPE_TTL_MS } from "./constants.js";

export async function runAutomation(tabId, MSG, prompt) {
  // Ask content for initial snapshot
  const snap = await getSnapshot(tabId, MSG);
  if (!snap) throw new Error("no snapshot from content script");

  const plan = await backend("/plan", {
    prompt,
    dom: snap.controls || [],
    start_url: snap.url || null,
  });

  let steps = (plan && plan.steps) ? [...plan.steps] : [];
  let total = 0;

  const recent = new Map(); // dedupe {action+target} → ts

  function sigOf(step) {
    const target = step.selector || JSON.stringify(step.query || {}) || step.url || "";
    const payload = step.text || "";
    return `${step.action}|${target}|${payload}`;
  }

  while (steps.length && total < MAX_TOTAL_ACTIONS) {
    const step = steps.shift();

    // dedupe repeat within TTL
    const sig = sigOf(step);
    const ts = Date.now();
    const last = recent.get(sig) || 0;
    if (ts - last < DEDUPE_TTL_MS) continue;
    recent.set(sig, ts);

    // Execute one action in tab
    const r = await performAction(tabId, MSG, step);
    await new Promise(r => setTimeout(r, 900)); // small settle time

    // Take fresh snapshot
    const snap2 = await getSnapshot(tabId, MSG);

    // Ask backend for next steps based on latest DOM
    try {
      const next = await backend("/next", {
        last_step: step,
        dom: snap2?.controls || [],
        current_url: snap2?.url || "",
        prompt,
      });
      if (next && next.steps && next.steps.length) {
        // Only prepend if not identical to last step signature
        const filtered = next.steps.filter(s => sigOf(s) !== sig);
        steps = filtered.concat(steps);
      }
    } catch (e) {
      // ignore
    }

    if (step.action === "done") break;
    total++;
  }
}
