// extension/content/main.js
// Bootstraps the panel, restores state, installs ping handler,
// and wires summarize / automation / bookmark actions.

(async () => {
  // Prevent multiple injections on SPA navigations
  if (window.__commet_loaded__) return;
  window.__commet_loaded__ = true;

  const urlFor = (p) => chrome.runtime.getURL(p);

  // Dynamic imports (no bundler needed)
  const [msgMod, domMod, stateMod, uiMod] = await Promise.all([
    import(urlFor("common/messages.js")),
    import(urlFor("content/dom.js")),
    import(urlFor("content/state.js")),
    import(urlFor("content/ui.js")),
  ]);

  const { MSG } = msgMod;
  const { snapshotPage, performAction, installPingHandler, extractReadableText, extractHeadings } = domMod;
  const { getOpenFlag, setOpenFlag, getState, setState, callBackend } = stateMod;
  const { mountPanel, ensurePanelVisible, restoreStateIntoUI } = uiMod;

  // Respond to background health checks
  installPingHandler(MSG);

  // Auto-open if flag says so
  const shouldOpen = await getOpenFlag(true);
  let panel = null;
  if (shouldOpen) panel = mountPanel();

  // If not yet mounted, provide a way to open via toolbar
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === MSG.OPEN_PANEL) {
      setOpenFlag(true).then(() => {
        panel = mountPanel();
        sendResponse({ ok: true });
      });
      return true;
    }
  });

  // If mounted, restore state into UI
  const st = await getState();
  if (panel) restoreStateIntoUI(panel.shadowRoot, st);

  // Attach UI handlers if panel exists or when it is mounted later
  function wireUI() {
    if (!panel) panel = mountPanel();
    const { shadowRoot, elements, api } = panel;
    const { taskEl, bookmarkEl, panels } = elements;
    const { appendLogHTML, setResultMarkdown, setSteps, switchTab } = api;

    // Persist prompt/bookmark changes
    const persist = () => {
      setState({
        prompt: taskEl.value,
        logHTML: panels.log.innerHTML,
        resultHTML: panels.result.innerHTML,
        stepsJSON: JSON.stringify([]), // steps will be streamed
        bookmark: bookmarkEl.value
      });
    };
    taskEl.addEventListener("input", persist);
    bookmarkEl.addEventListener("change", persist);

    // ENTER to run automation
    taskEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        shadowRoot.getElementById("btn-auto").click();
      }
    }, { capture: true });

    // Summarize
    shadowRoot.getElementById("btn-sum").addEventListener("click", async () => {
      const task = taskEl.value.trim() || "Summarize this page";
      const snap = snapshotPage();
      const text = extractReadableText(20000);
      const headings = extractHeadings(40);

      appendLogHTML(`📝 Summarize: <b>${snap.title || snap.url}</b>`);
      switchTab("result");
      setResultMarkdown("_Summarizing…_");
      await setState({ prompt: task });

      try {
        const data = await callBackend("/summarize", {
          task,
          context: { url: snap.url, title: snap.title, text, headings, dom: snap.controls.slice(0, 200) }
        });
        setResultMarkdown(data.summary || String(data));
      } catch (e) {
        setResultMarkdown("**Summary failed**<br/><br/>" + String(e));
      }
      persist();
    });

    // Bookmark
    shadowRoot.getElementById("btn-bm").addEventListener("click", async () => {
      const bm = bookmarkEl.value;
      if (!bm) { appendLogHTML("⚠️ Select a bookmark first", "err"); return; }
      appendLogHTML(`🔖 Running bookmark: <b>${bm}</b>`);
      try {
        const res = await callBackend("/run_bookmark", { name: bm });
        setResultMarkdown("**Bookmark executed**\n\n```json\n" + JSON.stringify(res, null, 2) + "\n```");
      } catch (e) {
        appendLogHTML(`❌ bookmark error: ${String(e)}`, "err");
      }
      persist();
    });

    // Automation (delegated to background)
    shadowRoot.getElementById("btn-auto").addEventListener("click", async () => {
      const prompt = taskEl.value.trim();
      if (!prompt) { appendLogHTML("⚠️ Enter a task first", "err"); return; }
      await setOpenFlag(true);
      appendLogHTML(`⚡ <b>Automation:</b> ${prompt}`);
      switchTab("log");
      await setState({ prompt });

      chrome.runtime.sendMessage({ type: MSG.START_AUTOMATION, prompt }, (resp) => {
        if (!resp?.ok) appendLogHTML("❌ failed to start automation", "err");
      });
    });

    // Content-side automation endpoints used by background loop:
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      (async () => {
        try {
          if (msg?.type === MSG.GET_SNAPSHOT) {
            const snap = snapshotPage();
            sendResponse({ ok: true, snapshot: snap });
            return;
          }
          if (msg?.type === MSG.PERFORM_ACTION) {
            const r = await performAction(msg.action);
            // Optional: after navigation, you can show a tiny new snapshot in result
            sendResponse(r);
            return;
          }
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true;
    });
  }

  // If panel was mounted earlier, wire it now; else wire on demand
  if (panel) wireUI();
  else {
    // If the panel is opened later (toolbar), wire when it mounts
    const obs = new MutationObserver(() => {
      const host = document.getElementById("commet-root-host");
      if (host && host.shadowRoot && !host.__wired) {
        host.__wired = true;
        panel = { shadowRoot: host.shadowRoot, elements: {}, api: {} };
        wireUI();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
