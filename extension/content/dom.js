// extension/content/dom.js
// DOM helpers, snapshot, executor, and the required installPingHandler().

import { ACT } from "../common/messages.js";

// ---------- query + visibility ----------
export function cssPath(el) {
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

export function isVisible(el) {
  if (!el || !(el instanceof Element)) return false;
  const r = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
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

function accessibleName(el) {
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

// Strong bias towards real text inputs for 'Search' name
function scoreAgainstName(el, targetName) {
  const base = 0;
  if (!targetName) return base + 1;

  const n = targetName.trim().toLowerCase();
  const cand = accessibleName(el).toLowerCase();
  let score = base;

  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute("type") || "").toLowerCase();
  const role = (el.getAttribute("role") || "").toLowerCase();

  const isTextInput = (tag === "input" && (!type || ["text","search","email","url","number"].includes(type))) || tag === "textarea" || role === "textbox" || el.getAttribute("contenteditable")==="true";
  const isSelectLike = tag === "select" || role === "combobox";

  if (/amazon\./i.test(location.host)) {
    try {
      const amazonBox = document.querySelector("#twotabsearchtextbox");
      if (amazonBox && amazonBox === el) score += 200;
    } catch {}
  }

  if (cand) {
    if (cand === n) score += 60;
    else if (cand.startsWith(n)) score += 40;
    else if (cand.includes(n)) score += 25;
    const A = new Set(cand.split(/\s+/));
    const B = new Set(n.split(/\s+/));
    let overlap = 0; B.forEach(t => { if (A.has(t)) overlap++; });
    score += overlap * 5;
  } else {
    score += 1;
  }

  if (n.includes("search") && isTextInput) score += 80;
  if (n.includes("search") && isSelectLike) score -= 40;

  if (isVisible(el)) score += 5;

  return score;
}

export function resolveByQuery(query) {
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

// ---------- snapshot ----------
export function snapshotPage() {
  const q = 'a[href], button, [role=button], input, textarea, select, [role]';
  const controls = [...document.querySelectorAll(q)].map(el => ({
    tag: el.tagName.toLowerCase(),
    text: (el.innerText || el.value || '').trim(),
    role: el.getAttribute('role') || null,
    name:
      el.getAttribute('aria-label') ||
      el.getAttribute('name') ||
      el.getAttribute('title') ||
      el.placeholder ||
      (el.innerText || '').trim(),
    href: el.getAttribute('href') || null,
    selector: cssPath(el),
  }));

  const links = controls
    .filter(c => c.tag === 'a' && c.href)
    .map(c => {
      try { return new URL(c.href, location.href).href; } catch { return null; }
    })
    .filter(Boolean);

  return {
    url: location.href,
    title: document.title,
    origin: location.origin,
    controls,
    links: [...new Set(links)].slice(0, 200),
  };
}

// ---------- text extraction ----------
export function extractReadableText(maxChars = 20000) {
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('script,style,noscript,svg,canvas,iframe,nav,footer,aside,form,button,menu,dialog')
    .forEach(n => n.remove());
  const main = clone.querySelector('main,[role=main],article') || clone;
  let text = (main.innerText || '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (text.length > maxChars) text = text.slice(0, maxChars) + ' …';
  return text;
}

export function extractHeadings(limit = 40) {
  return [...document.querySelectorAll('h1,h2,h3')]
    .map(h => (h.innerText || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function collectTopResultsMarkdown() {
  const h = extractHeadings(10);
  const links = [...document.querySelectorAll('a[href]')]
    .filter(a => isVisible(a))
    .slice(0, 10)
    .map((a, i) => `${i + 1}. [${(a.innerText || a.title || a.href).trim().slice(0, 120) || a.href}](${a.href})`)
    .join('\n');
  const headBlock = h.length ? `### Top headings\n- ${h.join('\n- ')}\n\n` : '';
  return `## ${document.title || 'Page'}\n\n${headBlock}${links ? '### Top results\n' + links : ''}`;
}

// ---------- waits ----------
export const wait = (ms) => new Promise(r => setTimeout(r, ms));

export async function waitForPageSettled(timeout = 12000) {
  const start = Date.now();
  while (document.readyState !== 'complete' && Date.now() - start < timeout) await wait(120);
  let last = document.body ? document.body.innerHTML.length : 0;
  let stable = 0;
  while (Date.now() - start < timeout) {
    await wait(300);
    const cur = document.body ? document.body.innerHTML.length : 0;
    if (cur === last) { stable += 1; if (stable >= 2) break; }
    else { stable = 0; last = cur; }
  }
}

export async function waitForText(txt, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if ((document.body?.innerText || '').includes(txt)) return true;
    await wait(250);
  }
  return false;
}

// ---------- performAction ----------
export async function performAction(action) {
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

    switch (action.action) {
      case ACT.NAVIGATE: {
        const u = action.url || "";
        if (!u) return { ok: false, error: "missing-url" };
        location.href = u;
        return { ok: true, didNavigate: true };
      }
      case ACT.CLICK: {
        const el = findTarget();
        if (!el) return { ok: false, error: "selector-not-found" };
        el.scrollIntoView({ block: "center", inline: "center" });
        el.click();
        return { ok: true, didNavigate: false };
      }
      case ACT.TYPE: {
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
        }
        return { ok: true, didNavigate: false };
      }
      case ACT.PRESS_ENTER: {
        const el = document.activeElement || document.body;
        ["keydown","keypress","keyup"].forEach(type => {
          el.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", which: 13, keyCode: 13, bubbles: true }));
        });
        return { ok: true, didNavigate: false };
      }
      case ACT.SCROLL: {
        const times = action.times || 1;
        for (let i = 0; i < times; i++) {
          window.scrollBy(0, action.direction === "up" ? -600 : 600);
          await wait(350);
        }
        return { ok: true, didNavigate: false };
      }
      case ACT.WAIT_TEXT: {
        const ok = await waitForText(action.text || "", action.timeout || 8000);
        return ok ? { ok: true, didNavigate: false } : { ok: false, error: "wait-timeout" };
      }
      case ACT.DONE:
        return { ok: true, done: true, didNavigate: false };
      default:
        return { ok: false, error: "unknown-action" };
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------- ping handler (required) ----------
export function installPingHandler(MSG_CONST) {
  chrome.runtime.onMessage.addListener((m, _sender, sendResponse) => {
    if (m && m.type === MSG_CONST.PING_CONTENT) {
      sendResponse({ ok: true, ts: Date.now() });
      return true;
    }
  });
}
