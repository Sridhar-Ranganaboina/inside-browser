First: What “masking” really means (plain English)

Masking = replacing sensitive values with safe placeholders before the LLM ever sees them.

The LLM reasons on meaning, not real secrets.

Before

Customer PAN: ABCDE1234F
Phone: 9876543210


After masking

Customer PAN: <PAN_1>
Phone: <PHONE_1>


The LLM can still:

detect anomalies

reason about relationships

explain issues

…but cannot leak real data.

DOM (Browser Tab)
   ↓
Field Extraction
   ↓
🔐 MASKING (LOCAL)
   ↓
LLM Prompt
   ↓
LLM Response


📌 Masking happens locally, inside the browser or edge service
📌 Never after the LLM call

Step-by-Step: How Masking Actually Works
1️⃣ Identify sensitive fields (Detection)

Masking starts with detection.

What you detect
Type	Examples
PII	Name, phone, email
Gov IDs (India)	PAN, Aadhaar
Financial	Account number, card
Secrets	Tokens, keys
How detection happens
A. Pattern-based (fast & reliable)
PAN = r"[A-Z]{5}[0-9]{4}[A-Z]"
PHONE = r"\b[6-9]\d{9}\b"

B. Label-based (DOM fields)
<label>PAN Number</label>
<input value="ABCDE1234F" />

C. Context-based (NER)

“John paid from account 9876543210”

NER detects:

PERSON

ACCOUNT_NUMBER

📌 Detection can be layered (best practice)

2️⃣ Decide masking strategy (Policy-driven)

Not everything is masked the same way.

Field	Strategy	Why
PAN	Tokenize	Possible re-reference
Phone	Partial mask	Last 4 digits useful
Name	Replace	Identity irrelevant
Amount	Keep	Needed for reasoning
3️⃣ Replace values with tokens (Masking)
Example (structured data)

Before

{
  "name": "Ravi Kumar",
  "pan": "ABCDE1234F",
  "phone": "9876543210"
}


After

{
  "name": "<PERSON_1>",
  "pan": "<PAN_1>",
  "phone": "<PHONE_1>"
}


📌 Tokens are:

Deterministic (same value → same token in session)

Meaning-preserving

Safe to log

4️⃣ Maintain a token map (optional but powerful)
{
  "<PAN_1>": "ABCDE1234F",
  "<PHONE_1>": "9876543210"
}


🔐 Stored:

In memory (browser session)

Or encrypted vault (server)

🚫 Never sent to LLM

5️⃣ Build the LLM prompt (masked only)

❌ Never:

Analyze transaction ABCDE1234F


✅ Always:

Analyze transaction <PAN_1>


LLMs don’t need the real value — they need relationships and patterns.

6️⃣ LLM response stays masked

LLM output

The PAN <PAN_1> is associated with multiple transactions.


At this stage:

Still masked

Still safe

7️⃣ Optional unmasking (very controlled)

Only if:

User has permission

Action is read-only or explicitly approved

The PAN ABCDE1234F is associated with multiple transactions.


📌 This happens outside the LLM, after reasoning is done.

Why this works (key insight)

LLMs operate on:

Structure

Context

Relationships

Language patterns

They do not need:

Real PANs

Real phone numbers

Real names

So masking:

Preserves reasoning

Eliminates leakage

Masking in a Browser-Based (Same-Tab) System
Why this is extra safe

Inside Google Chrome:

Masking runs locally

User can inspect it

No backend sees raw PII

This is ideal for:

Banking

Compliance

Healthcare

Internal tools

Real-World Example (End-to-End)
User types:

“Analyze this transaction”

Page shows:
Name: Ravi Kumar
PAN: ABCDE1234F
Amount: ₹2,50,000

Masked prompt sent to LLM:
Transaction details:
Name: <PERSON_1>
PAN: <PAN_1>
Amount: ₹2,50,000

Analyze for anomalies.

LLM response:
This transaction associated with <PAN_1> is unusually large.

User sees:
This transaction associated with ABCDE1234F is unusually large.


(only if allowed)

Common Mistakes (Avoid These)

❌ Mask after LLM
❌ Mask inconsistently
❌ Embed raw PII in vectors
❌ Allow LLM to unmask
❌ Store raw prompts

One-Line Rule (Memorable)

If the LLM can see it, assume it can leak it.
Mask first. Always.
