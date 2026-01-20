# Example Prompt:  Prepare a list of returned orders from last four months

✅ Yes, the assistant can traverse multiple pages
❌ No, it cannot roam freely or silently
✅ It moves only within a user-approved, bounded navigation scope

So “only inside the current page” does NOT mean “only one URL forever”.
It means only within a controlled, observable browsing context.

Let me explain why, how, and then walk through your Amazon orders example step by step.

1️⃣ Clarifying the confusing line (the root of the issue)

You quoted:

“Can simulate clicks/inputs
BUT only inside the current page”

This sentence is imprecise. The correct version is:

“Can simulate clicks/inputs only within the user-approved browsing context (same tab or controlled child tabs).”

So the constraint is NOT:

❌ “One static page only”

The real constraint IS:

✅ Same tab (or explicitly allowed new tab)

✅ Same session (same cookies, same auth)

✅ User-visible navigation

✅ No background or hidden traversal

2️⃣ The correct mental model (this fixes everything)

Think of the assistant as:

A human assistant holding your mouse — not a web crawler.

A human:

Clicks links

Goes to next pages

Uses pagination

Scrolls

Waits for pages to load

…but only where you can see, and only while you’re watching.

That’s exactly the model here.

3️⃣ What is actually restricted (very important distinction)
❌ What is NOT allowed

Background crawling

Headless browsing

Visiting URLs without showing them

Jumping across domains silently

Using backend APIs directly

✅ What IS allowed

Clicking visible links

Navigating to user-relevant pages

Following pagination

Reading content from each loaded page

Doing all of this in front of the user

4️⃣ Your Amazon example — step by step (concrete)

Let’s walk it slowly.

Scenario

You are on Amazon homepage
You type:

“Can you prepare a list of orders I returned in the last four months?”

You are 100% correct:

This info is not on the homepage

It requires navigation + pagination

Now watch how the safe local-execution model handles this.

5️⃣ Step-by-step: How this works safely
Step 1️⃣ User intent is understood (NO navigation yet)

User input:

“Prepare a list of orders I returned in the last four months”

System infers:

{
  "intent": "ANALYZE",
  "task": "COLLECT_RETURNED_ORDERS",
  "time_range": "LAST_4_MONTHS",
  "write_actions": false
}


📌 Still no page access, no clicks.

Step 2️⃣ Assistant explains the navigation plan (critical)

Before clicking anything, the assistant tells you:

“I’ll navigate to your Orders page, filter returned items, and go through pages covering the last four months. You can stop me anytime.”

Buttons:

▶ Continue

⏸ Pause

❌ Cancel

This is the trust gate.

Step 3️⃣ Controlled navigation begins (same tab)

Now the content script:

Clicks “Returns & Orders”

Page changes (same tab)

You see it happen

This is allowed because:

It’s a visible UI action

Same session

Same permissions

Step 4️⃣ Pagination is handled (still safe)

On the Orders page:

Assistant reads visible orders

Checks order dates

If older than 4 months → stops

If pagination needed → clicks “Next”

Each pagination step is:

A visible click

On a visible button

Fully observable

Optionally:

“Moving to page 2 to continue collecting returns. Continue?”

Step 5️⃣ Data is extracted + masked locally

From each page:

{
  "order_id": "<ORDER_12>",
  "date": "2025-11-18",
  "status": "Returned",
  "item": "<ITEM_7>"
}


Masked immediately

Stored in session memory

No raw PII sent out

Step 6️⃣ Assistant stops automatically

The moment:

Orders are older than 4 months

Or no more returned items

Navigation stops.

📌 This is bounded traversal, not crawling.

Step 7️⃣ Result is shown to the user

“Here’s a list of 7 returned orders from the last four months.”

Optionally:

Download as CSV

Summarize reasons

Highlight patterns

6️⃣ Why this does NOT violate the safety model

Let’s map this back to the original constraints.

✅ Same cookies / same auth

✔ Uses your logged-in Amazon session

✅ Same tab or controlled navigation

✔ Only follows visible links you could click yourself

✅ User can observe every step

✔ You literally watch the Orders page load

✅ Read-only by default

✔ No cancellations, no reorders, no refunds

✅ Pause / cancel

✔ You can stop at page 1 if you want

✅ Consent-based escalation

✔ Any action like “download” or “export” is optional

7️⃣ Why this is still NOT “automation gone wild”

Compare two approaches:

❌ Headless automation (bad)

Logs in using stored credentials

Scrapes orders via APIs

Runs in background

User sees nothing

🚨 This fails security, compliance, and trust.

✅ Local execution (this model)

Uses your browser

Uses your clicks

Uses your visibility

Uses your approval

✅ This passes enterprise reviews.

8️⃣ The key rule (remember this)

The assistant may navigate, but it may never surprise the user.

Or even simpler:

If a human wouldn’t be comfortable doing it silently, the assistant isn’t allowed to either.

9️⃣ One line you can reuse to explain this to others

“Local execution allows controlled, user-visible navigation across pages within the same authenticated session, while preventing background crawling or unauthorized access.”

1️⃣ Navigation State Machine (this removes all ambiguity)
2️⃣ Chrome Extension code skeleton (how this is enforced in practice)

I’ll keep it implementation-level, not theory.

PART 1️⃣ Navigation State Machine (this is the key control)

This state machine is what makes multi-page traversal safe, observable, and bounded.

🧠 Core idea

Navigation is not free-form clicking.
It is a stepwise state transition system.

Every page visit must:

Be expected

Be explainable

Be stoppable

🔁 State Machine Definition
States
IDLE
↓
INTENT_CONFIRMED
↓
PLAN_PRESENTED
↓
NAVIGATING
↓
PAGE_READY
↓
DATA_COLLECTED
↓
CHECK_CONTINUE
↓
DONE

🧭 State-by-state explanation
🟦 1. IDLE

Extension loaded

User on any page

No actions allowed

🟦 2. INTENT_CONFIRMED

User types:

“Prepare a list of returned orders from last four months”

System produces:

{
  "intent": "ANALYZE",
  "task": "COLLECT_RETURNED_ORDERS",
  "navigation_required": true
}


📌 Still no clicks

🟦 3. PLAN_PRESENTED (VERY IMPORTANT)

Before navigating, the assistant must say:

“I will navigate to your Orders page, filter returned items, and go through pages until I cover the last four months. You can pause or stop anytime.”

Buttons:

▶ Start

❌ Cancel

🚨 If user does not approve → STOP

🟦 4. NAVIGATING

Now — and only now — navigation is allowed.

Rules:

Same tab

Visible clicks only

No direct URL fetch unless it’s a visible link

Example:

Click: “Returns & Orders”

🟦 5. PAGE_READY

The page is:

Fully loaded

DOM stable

Validation:

document.readyState === "complete"

🟦 6. DATA_COLLECTED

The content script:

Reads visible orders

Extracts date, status

Masks sensitive fields

Example:

{
  "order_id": "<ORDER_1>",
  "date": "2025-12-12",
  "status": "Returned"
}

🟦 7. CHECK_CONTINUE

Decision point:

{
  "oldest_date_seen": "2025-09-21",
  "target_range": "last 4 months",
  "more_pages_available": true
}


If:

Date still within range AND

“Next” button exists

→ Ask user or auto-continue (configurable)

🟦 8. DONE

Assistant stops and reports:

Summary

Structured list

Optional export

🚫 Navigation ends automatically

🔒 Hard safety guarantees from this model
Risk	Why it can’t happen
Infinite crawl	Pagination bounds
Silent navigation	Plan approval
Data mutation	Read-only intent
Background scraping	Same tab only
Hidden API calls	DOM-only access
PART 2️⃣ Chrome Extension Code Skeleton (Realistic)

Now let’s see how this is actually implemented.

🧩 Extension architecture (minimal)
/extension
 ├── background.js        # Orchestrator
 ├── content.js           # DOM + navigation
 ├── popup.html           # User UI
 ├── popup.js
 └── policy.js            # Intent + limits

1️⃣ popup.js — User input → intent
document.getElementById("run").onclick = async () => {
  const text = document.getElementById("input").value;

  chrome.runtime.sendMessage({
    type: "USER_INTENT",
    payload: { text }
  });
};

2️⃣ background.js — Intent inference + plan
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === "USER_INTENT") {
    const intent = inferIntent(msg.payload.text);

    if (!ALLOWED_INTENTS.includes(intent)) {
      notifyUser("This action is not allowed.");
      return;
    }

    const plan = buildNavigationPlan(intent);

    showPlanToUser(plan);
  }
});

3️⃣ Plan example (Amazon orders)
{
  "steps": [
    "Navigate to Orders page",
    "Filter returned items",
    "Collect orders until 4 months reached"
  ],
  "read_only": true
}

4️⃣ content.js — Controlled navigation
async function clickVisible(selector) {
  const el = document.querySelector(selector);
  if (!el) throw new Error("Element not found");
  el.click();
}


Example:

await clickVisible("#nav-orders");
await waitForPageLoad();

5️⃣ Pagination with bounds
while (withinDateRange() && hasNextPage()) {
  collectOrders();
  await clickVisible(".a-pagination .next");
  await waitForPageLoad();
}


📌 Loop breaks automatically when condition fails.

6️⃣ Pause / Cancel (global kill switch)
let cancelled = false;

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === "CANCEL") cancelled = true;
});

if (cancelled) throw new Error("User cancelled");

7️⃣ Masking happens BEFORE storage / LLM
function mask(value, type) {
  return `<${type}_${hash(value)}>`;
}

8️⃣ Why this passes security & compliance review

Because you can prove:

Every navigation step

Every page visited

Every action taken

Every user approval

Nothing happens invisibly.

Final takeaway (this resolves your original doubt)

Your instinct was correct:

“We need multi-page traversal to answer real questions.”

The correct constraint is NOT “single page”
The correct constraint is:

User-visible, bounded, consent-driven navigation within the same authenticated session
