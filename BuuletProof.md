# 🚀 WebGenie – FINAL BULLETPROOF COPILOT PROMPT (PRODUCTION READY)

---

# 🧠 ROLE

You are a highly capable AI system acting as:

* Senior Architect
* Senior Full Stack Engineer
* Data Scientist

👉 Maintain a **task list + progress tracker inside README**
👉 If interrupted, resume from last completed step

---

# 🧠 OBJECTIVE

Build a **production-ready AI Browser Assistant** using:

* NanoBrowser architecture (base)
* BrowserOS features (UI + skills + workflows)

WITHOUT:

* ❌ Playwright runtime inside extension
* ❌ Puppeteer Node runtime
* ❌ BrowserOS Chromium fork

---

# 🚨 PHASE 0: DEEP CODE UNDERSTANDING (MANDATORY)

---

## 🎯 Goal

Understand BOTH NanoBrowser and BrowserOS completely BEFORE implementation.

---

## 🔍 Analyze NanoBrowser

For EVERY file:

* Purpose
* Data flow
* Messaging
* Agents (Planner/Navigator)
* LLM integration
* UI

---

## 🔍 Analyze BrowserOS

For EVERY file:

* Skills
* Agent workflows
* Memory
* UI
* Playwright usage
* Automation patterns

---

## 📊 REQUIRED OUTPUT

* Component mapping
* Execution flow comparison
* Risk areas
* Reusable modules

---

## 🚨 RULE

❌ DO NOT START IMPLEMENTATION
✅ UNTIL analysis is complete

---

# 🏗️ PHASE 1: ARCHITECTURE

---

## 🚨 HARD RULES

* Execution ONLY in Extension

* Backend ONLY for LLM + audit

* Native Host ONLY for memory + data

* ❌ No Playwright

* ❌ No custom Chromium

* ✅ AzureChatOpenAI ONLY

* ❌ Remove multi-provider logic

* ❌ Extension MUST NOT call LLM

* ✅ Use `/llm/invoke`

* ❌ Native Host NO HTTP

* ❌ Native Host NO automation

---

# 🧩 PHASE 2: IMPLEMENTATION

---

## 🧩 Extension (CORE)

* Refactor NanoBrowser

* Remove LLM calls

* Implement PuppeteerCore-style abstraction using ONLY:

  * chrome.tabs
  * chrome.scripting
  * content scripts

* ❌ DO NOT use Puppeteer runtime

* ❌ DO NOT use Playwright

* Implement:

  * Planner Agent
  * Navigator Agent
  * Skills engine
  * BrowserOS-like UI

---

## 🧠 Backend (FastAPI)

Endpoints:

* POST `/llm/invoke` → AzureChatOpenAI
* POST `/audit/log`
* GET `/apps/whitelistedapps`

---

## ⚙️ Native Messaging Host

* Memory engine
* Chroma vector DB
* Task store
* Similarity search
* Chunking + embedding

---

# 🔥 PHASE 3: MEMORY OPTIMIZATION

---

```ts
if (similarityScore > threshold) {
  executeStoredWorkflow()
} else {
  callLLM()
}
```

---

# 🔁 PHASE 4: MIGRATION

---

From BrowserOS:

* Extract UI
* Extract skills
* Extract agent logic

Convert:

* Playwright → Puppeteer abstraction
* LLM → backend

---

# 🧪 PHASE 5: TEST SETUP

* Unit tests
* Integration tests
* Playwright E2E tests

---

# 🧪 PHASE 6: END-TO-END FUNCTIONAL TESTING (PRIMARY VALIDATION)

---

## 🎯 PRIMARY REQUIREMENT

👉 E2E Functional Tests are the **ONLY criteria for production readiness**

---

## 🚨 IMMEDIATE EXECUTION TRIGGER

After generating tests:

👉 MUST immediately execute them
❌ DO NOT STOP after generating tests

---

## 🚀 SYSTEM STARTUP (MANDATORY)

```bash
uvicorn main:app --reload
python native_host.py
```

* Load extension into Chrome
* Ensure system ready

---

## ⚙️ TEST EXECUTION

```bash
npx playwright test
python test_integration.py
```

OR

```bash
./run_phase6.ps1
```

---

## 🧠 EXECUTION LOOP (MANDATORY)

RUN → VALIDATE → FIX → RE-RUN → REPEAT UNTIL PASS

---

## 🧪 E2E REQUIREMENTS

* Real browser execution
* Real DOM interaction
* UI validation (chat panel, skills panel)

---

## 🧠 MEMORY VALIDATION

* First run → MUST call `/llm/invoke`
* Second run → MUST NOT call `/llm/invoke`

---

## 📊 PERFORMANCE

* Memory execution MUST be faster than LLM

---

## 🔐 SECURITY

* Block non-whitelisted domains

---

# 🧩 JSON TEST SUITE

Use the structured JSON test suite (provided earlier).

👉 Each test MUST be executed in real browser

---

# 🧪 TEST REPORT FORMAT

```json
{
  "test_id": "...",
  "browseros_result": "...",
  "new_system_result": "...",
  "match": true,
  "response_time_browseros": "...",
  "response_time_new": "...",
  "memory_used": true,
  "status": "PASS"
}
```

---

# 🚨 PHASE 7: BUILD + ERROR RESOLUTION

---

## 🎯 REQUIREMENT

Fix ALL errors from IDE "PROBLEMS" tab

---

## 🔧 RULE

* Fix → rebuild → verify
* Repeat until ZERO errors

---

## ✅ TARGET

All components must build:

* Extension
* Backend
* Native Host

---

# 🚨 EXECUTION VALIDATION

---

## ❌ INVALID

* Only test files created
* No execution logs

---

## ✅ VALID

* Tests executed
* Logs generated
* UI validated

---

# 🛑 FINAL COMPLETION CONDITION

Stop ONLY when:

* ALL E2E tests PASS
* ZERO errors in Problems tab
* Logs exist
* UI validated
* Memory optimization verified
* Performance ≥ BrowserOS
* No security issues

---

# 🔁 CONTINUOUS EXECUTION

* Maintain progress in README
* Resume if interrupted

---

# 🚀 FINAL GOAL

A system that:

* Runs in real browser
* Matches BrowserOS behavior
* Uses memory for fast execution
* Requires ZERO manual intervention
* Is production-ready

---

# 🚨 FINAL ENFORCEMENT

DO NOT STOP UNTIL:

* System is built
* Tests executed
* Failures fixed
* Everything validated

---
