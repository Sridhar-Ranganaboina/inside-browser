📖 Commet Assistant – Universal PoC

This PoC demonstrates a browser assistant that can:

Automation – perform natural language tasks on any website.

Summarization – summarize the current page in Markdown.

Bookmarks (wired automation) – execute pre-defined flows (e.g., "Create Change Request").

It works via a Chrome extension or an embeddable widget, powered by a FastAPI backend + LLM planner.

🚀 Setup
Backend (FastAPI + LangChain)
cd backend
poetry install
poetry run commet-backend


Configure .env with your Azure/OpenAI details:

OPENAI_API_KEY=Bearer <your-token>
OPENAI_API_BASE=https://<your-azure-endpoint>.openai.azure.com/
OPENAI_API_VERSION=2024-05-01-preview
OPENAI_DEPLOYMENT=<your-deployment-name>
DEBUG=true

Extension

Go to chrome://extensions, enable Developer Mode.

Load extension/ as unpacked extension.

Open a website (e.g., ServiceNow, Gmail, Amazon).

Click the extension → a right-docked panel (20%) opens automatically.

Enter a natural prompt:

“Search for cricket news”

“Summarize this page in 3 bullets”

“Create change request”

Widget

To embed in any app you control:

<script>
  window.COMMET_BACKEND = "http://localhost:8000";
</script>
<script src="widget/dist/commet-widget.js"></script>


This injects the same right-docked assistant panel into the page.

⚙️ Agents
1. Automation Agent

Converts natural prompts into step-by-step plans using LLM.

Actions supported: click, type, pressEnter, navigate, scroll, waitForText, done.

Executes actions in browser context with re-plan loop if an action fails.

2. Summarizer Agent

Extracts text content of the current page.

Uses LLM to produce a concise summary in Markdown.

Rendered in the Result tab of the extension/widget.

3. Bookmarks (Wired Automations)

Predefined tasks (e.g., “create_change_request”).

Executes a stored sequence of steps instantly.

🔄 Traversal Algorithm

Each page snapshot captures DOM controls (role, name, selector, attributes).

Planner uses LLM to map natural language → semantic element (not hard-coded).

After each action:

Content script re-snapshots DOM.

Calls backend /next for re-planning if needed.

This loop allows it to adapt dynamically across ServiceNow, Gmail, Amazon, Cricinfo, etc.

📊 Architecture Diagram
flowchart LR
    subgraph Browser
        UI[Extension / Widget UI]
        CS[Content Script: Snapshot + Executor]
    end
    subgraph Backend
        API[FastAPI Endpoints]
        Planner[Planner (LLM via LangChain)]
        Agents[Automation | Summarizer | Bookmarks]
        Traversal[Traversal Manager]
        DB[(SQLite Persistence)]
    end

    UI -->|Prompt| API
    CS -->|DOM Snapshot| API
    API --> Planner
    Planner --> Agents
    Agents --> API
    API --> UI
    API --> CS
    CS -->|Actions| Website[Active Website]
    CS -->|Snapshot + Logs| UI
    API --> DB
    API --> Traversal

📜 Sequence Diagram
sequenceDiagram
    participant User
    participant Extension
    participant Backend
    participant Planner
    participant Agent
    participant Website

    User->>Extension: Enter natural prompt
    Extension->>Website: Capture DOM Snapshot
    Extension->>Backend: POST /intent {task, snapshot}
    Backend->>Planner: Generate Plan (LLM JSON steps)
    Planner-->>Backend: Plan JSON
    Backend->>Agent: Route → Automation | Summarizer | Bookmark
    Agent-->>Backend: Steps or Summary
    Backend-->>Extension: Response
    Extension->>Website: Execute actions
    Website-->>Extension: Updated DOM
    Extension->>Backend: POST /next {last_step, snapshot}
    Backend->>Planner: Re-plan if needed
    Planner-->>Backend: New steps
    Backend-->>Extension: Next steps
    Extension-->>User: Show Markdown Result + Step Log

🖥️ UI Features

Right-docked panel (20% width, movable).

Tabs:

Log → execution progress.

Result → summaries / automation outputs (Markdown).

Steps → executed plan steps.

Inline marked.js renderer → safe Markdown → HTML.

Auto-opens when extension is clicked.

✅ Example Prompts

ServiceNow: “Create change request” → automation.

ServiceNow: “List my incidents from this month” → automation.

Gmail: “Write an email to Raghu about my leave tomorrow” → automation.

Cricinfo: “Summarize MS Dhoni’s batting stats” → summarization.

Amazon: “Search washing machine < 30000, 5 star, add to cart” → automation.

🛡️ Debug & Config

DEBUG=true in .env → shows logs & executed steps.

Disable in production for performance.