1️⃣ Intent Taxonomy (Capabilities, not phrases)
🔑 Core idea

You do NOT define intents as user phrases.
You define them as safe capabilities.

User text → maps → intent
Intent → controls → what the system can do

📘 Minimal but powerful intent set (recommended)
INTENTS:
  ANALYZE:
    description: "Understand, reason, detect issues"
    permissions:
      - READ_DOM
      - EXTRACT_VISIBLE_DATA
      - SUMMARIZE
    write_allowed: false

  VERIFY:
    description: "Check against policy, rules, or expectations"
    permissions:
      - READ_DOM
      - CROSS_REFERENCE_POLICY
    write_allowed: false

  INVESTIGATE:
    description: "Explore relationships, timelines, anomalies"
    permissions:
      - READ_DOM
      - NAVIGATE_READ_ONLY
      - TEMP_HIGHLIGHT
    write_allowed: false

  EXPLAIN:
    description: "Explain what is happening and why"
    permissions:
      - READ_DOM
    write_allowed: false

  SUGGEST:
    description: "Propose next steps (no execution)"
    permissions:
      - READ_DOM
    write_allowed: false

  MODIFY:
    description: "Change data on the page"
    permissions:
      - READ_DOM
      - WRITE_DOM
    write_allowed: true
    requires_confirmation: true


📌 Important

Most enterprise systems only enable ANALYZE / VERIFY / EXPLAIN

MODIFY is usually off by default

2️⃣ Free-Text → Intent Inference (Safe & Flexible)
✅ Yes, user can type anything

Examples:

“Analyze this transaction”

“Does this violate policy?”

“Why does this look suspicious?”

“Approve this case” ❌ (dangerous if unchecked)

Step 1️⃣ Capture user text (UX layer)
{
  "user_input": "Analyze this transaction",
  "tab_id": 123,
  "timestamp": "2026-01-20T10:32:00Z"
}

Step 2️⃣ Intent inference (lightweight & safe)

You can do this without touching the DOM yet.

Option A: Rules + keywords (fast, deterministic)
def infer_intent(text):
    t = text.lower()
    if "analy" in t or "check" in t:
        return "ANALYZE"
    if "verify" in t or "validate" in t:
        return "VERIFY"
    if "approve" in t or "submit" in t:
        return "MODIFY"
    return "EXPLAIN"

Option B: Small LLM (recommended for flexibility)
SYSTEM:
Classify the user's intent into one of:
ANALYZE, VERIFY, INVESTIGATE, EXPLAIN, MODIFY.
Do NOT invent new intents.

USER:
Analyze this transaction


➡️ Output:

{
  "intent": "ANALYZE",
  "confidence": 0.94
}


📌 This LLM call:

Uses no sensitive data

Has no page access

Is safe to log

Step 3️⃣ Intent enforcement gate (non-negotiable)
ALLOWED_INTENTS = ["ANALYZE", "VERIFY", "INVESTIGATE", "EXPLAIN"]

if intent not in ALLOWED_INTENTS:
    return ask_user_confirmation_or_block()


If user types:

“Approve this transaction”

You respond:

“I can analyze and explain this transaction, but I can’t approve it without explicit confirmation.”

✅ Trust preserved
✅ No silent escalation

3️⃣ Context Collection (Only AFTER intent is allowed)

Now the content script runs inside the same browser tab (same session, same cookies).

This happens inside Google Chrome via content scripts.

Rules:

Same tab only

Visible DOM only

Mask sensitive fields immediately

{
  "transaction_id": "TXN_18273",
  "amount": "<AMOUNT_1>",
  "date": "2026-01-18",
  "flags": ["unusual_time", "new_payee"]
}

4️⃣ Prompt Construction (User text ≠ prompt)

❌ Bad:

User said: "Analyze this transaction"


✅ Correct:

TASK: Analyze a financial transaction for anomalies.

CONTEXT:
- Amount: <AMOUNT_1>
- Flags: unusual_time, new_payee

CONSTRAINTS:
- Read-only
- No approvals


User text becomes metadata, not instructions.

5️⃣ UI / UX Patterns (This is where trust is built)
Pattern A️⃣ Command bar (power users)
> Analyze this transaction
> Verify against policy
> Why is this flagged?


Under the hood:

Free text → intent → constraints

Pattern B️⃣ Hybrid UI (best for enterprises)

Typed input for flexibility

Intent chip shown back to user

Example UI feedback:

🔍 Detected intent: Analyze (read-only)

This reassures users instantly.

Pattern C️⃣ Safe escalation for write actions

If intent = MODIFY:

⚠ This will change data on the page.
Preview changes?
[Preview] [Cancel]


No preview → no action.

6️⃣ Real Enterprise Use Cases (Mapped Cleanly)
🏦 Banking – Fraud Review

User types:

“Why does this transaction look suspicious?”

System:

Intent → ANALYZE

Context → visible transaction history

Output → explanation only

No approvals. No actions.

📋 Compliance – KYC / AML

User types:

“Verify this case against policy”

System:

Intent → VERIFY

Context → case data + policy text

Output → mismatch explanations

Officer decides.

🧪 QA / Support

User types:

“Check why this form fails”

System:

Intent → INVESTIGATE

Context → DOM + errors

Output → root cause hints

7️⃣ One Diagram-Level Summary (Mental Model)
Free Text
   ↓
Intent Inference
   ↓
Allowlist Gate
   ↓
Context Collection (Same Tab)
   ↓
Masked Prompt
   ↓
LLM Reasoning
   ↓
Suggestions (No Actions)

8️⃣ Final Recommendation (Straight Talk)

✅ Allow free-text
❌ Never trust free-text
✅ Always constrain via intent
✅ Keep humans in control

The intent layer is the seatbelt of browser-based AI.
You don’t remove it just because the driver is skilled.
