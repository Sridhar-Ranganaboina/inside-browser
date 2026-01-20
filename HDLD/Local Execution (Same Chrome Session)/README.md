<img width="1408" height="1400" alt="image" src="https://github.com/user-attachments/assets/01909866-e660-47ec-bea2-03018db92e16" />
<img width="1200" height="1200" alt="image" src="https://github.com/user-attachments/assets/802405dc-159b-4aea-975f-636015267ca7" />
<img width="1408" height="1400" alt="image" src="https://github.com/user-attachments/assets/9df99e9d-5a7e-4c3c-97c1-d12373b3e64c" />


You are not automating a browser from a server.

Instead:

Code runs inside the user’s own browser

Inside the same tab/session

Using the user’s existing login & cookies

Fully visible to the user

Think of it as:

“A very smart assistant sitting inside your browser, doing only what you can already do.”

This is typically done using:

Content scripts in a Google Chrome extension

Optional background scripts for orchestration

Step-by-Step: How It Works (Concrete Flow)
Step 1️⃣ User opens a real web app (Jira, ServiceNow, Bank portal, CRM)

User is already logged in

Cookies, MFA, SSO all handled naturally

No credential sharing

👉 Context used

DOM (page structure)

Visible data

URL

User session state

Step 2️⃣ User explicitly starts the workflow

Example:

“Analyze this transaction”
“Verify this compliance case”
“Check this ticket for issues”

This action:

Clicks a button in the extension UI

Or selects text → “Run Analysis”

👉 Context used

User-selected content

Current page state

Active tab only

🚫 No background crawling
🚫 No silent automation

Step 3️⃣ Content script reads data (Read-only by default)

The script:

Reads text from the page

Extracts tables, fields, IDs

Takes snapshots of what the user can already see

DOM → Structured JSON → Masking → LLM


👉 Context used

Exact visible fields

On-page labels

User-selected scope

✅ Critical safety point
If the user can’t see it, the script can’t see it.

Step 4️⃣ LLM reasoning happens (outside the page)

Sensitive fields are masked/tokenized

Only contextual meaning is sent

LLM returns suggestions, not actions

Example LLM output:

“This transaction deviates from historical patterns”
“Clause 7 may violate policy”

👉 Context used

Masked facts

Page semantics

User intent (“analyze”, “verify”, “review”)

Step 5️⃣ Step-by-step execution (Only if allowed)

If actions are needed:

Each step is shown

User must confirm

Can pause / cancel anytime

Example:

Step 1: Open linked document
[Continue] [Cancel]

Step 2: Highlight discrepancy
[Continue] [Cancel]


👉 Context used

Current DOM state

User approval per step

🚫 No auto-submit
🚫 No silent clicks

Step 6️⃣ Optional write actions (Strict consent)

Only after:

Explicit confirmation

Clear preview of changes

Example:

“This will add a comment to the case. Proceed?”
