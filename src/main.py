import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse, urljoin

from settings import settings
from persistence import init_db, upsert_node
from planner import generate_plan
from models import PlanModel
from traversal_manager import TraversalManager
from agents.automation import AutomationAgent
from agents.summarizer import SummarizerAgent
from agents.bookmarks import BookmarksAgent

app = FastAPI(title="Commet Assistant Universal")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB + lightweight traversal helper
init_db()
traversal = TraversalManager(max_depth=4)


# ----------------------------
# Helpers
# ----------------------------
def _normalize_url(href: Optional[str], base: Optional[str] = None) -> Optional[str]:
    if not href:
        return None
    try:
        # Resolve relative links against base when available
        if base:
            return urljoin(base, href)
        return href
    except Exception:
        return None


def _origin_of(u: Optional[str]) -> Optional[str]:
    try:
        return urlparse(u).netloc if u else None
    except Exception:
        return None


# ----------------------------
# Intent multiplexer
# ----------------------------
@app.post("/intent")
async def intent(payload: Dict[str, Any]):
    task = payload.get("task", "") or ""
    context = payload.get("context", {}) or {}

    tl = task.lower()
    if "summary" in tl or "summarize" in tl:
        agent = SummarizerAgent()
        return {"type": "summary", "result": await agent.run(context)}

    if "bookmark" in payload:
        agent = BookmarksAgent()
        return {"type": "bookmark", "result": await agent.run(payload)}

    agent = AutomationAgent()
    return {
        "type": "automation",
        "result": await agent.run({"task": task, "dom": context.get("controls", [])}),
    }


# ----------------------------
# Planning & Next-step endpoints
# ----------------------------
@app.post("/plan")
async def plan_endpoint(payload: Dict[str, Any]):
    prompt = payload.get("prompt", "") or ""
    dom = payload.get("dom", []) or []
    start_url = payload.get("start_url")

    if start_url:
        traversal.seed(start_url)
        upsert_node(url=start_url, title=None, origin=_origin_of(start_url))

    plan: PlanModel = await generate_plan(prompt, dom)
    return plan.model_dump()


@app.post("/next")
async def next_endpoint(payload: Dict[str, Any]):
    dom = payload.get("dom", []) or []
    prompt = payload.get("prompt", "continue") or "continue"
    plan: PlanModel = await generate_plan(prompt, dom)
    return plan.model_dump()


# ----------------------------
# Summarization (prefers real page text from extension)
# ----------------------------
@app.post("/summarize")
async def summarize_endpoint(payload: Dict[str, Any]):
    task = (payload.get("task") or "Summarize this page").strip()
    ctx = payload.get("context") or {}

    # Prefer the real extracted text sent by the extension
    text = (ctx.get("text") or "").strip()
    if not text:
        # Fallback: join visible control texts if text is empty
        controls = ctx.get("dom") or []
        text = "\n".join(
            [str(c.get("text") or "") for c in controls if c.get("text")]
        ).strip()

    agent = SummarizerAgent()
    summary = await agent.run(
        {"text": text, "title": ctx.get("title"), "url": ctx.get("url")}
    )
    return {"summary": summary}


# ----------------------------
# Bookmarks
# ----------------------------
@app.get("/bookmarks")
async def list_bookmarks():
    # Extend as needed
    return {"bookmarks": ["create_change_request"]}


@app.post("/run_bookmark")
async def run_bookmark(payload: Dict[str, Any]):
    agent = BookmarksAgent()
    return await agent.run(payload)


# ----------------------------
# 🔎 Explore (restored)
# Accepts current_url + a set of links and records them. Optionally
# nudges the traversal queue if your TraversalManager exposes such APIs.
# ----------------------------
@app.post("/explore")
async def explore_endpoint(payload: Dict[str, Any]):
    current_url: Optional[str] = payload.get("current_url")
    links: List[str] = payload.get("links") or []

    added = 0
    normalized_links: List[str] = []

    # Ensure current URL is tracked
    if current_url:
        upsert_node(
            url=current_url,
            title=None,
            origin=_origin_of(current_url),
        )
        # Safe: if these methods exist, use them; otherwise ignore
        try:
            if hasattr(traversal, "seed"):
                traversal.seed(current_url)
        except Exception:
            pass

    # Normalize + persist discovered links
    for raw in links:
        u = _normalize_url(raw, current_url)
        if not u:
            continue
        try:
            upsert_node(url=u, title=None, origin=_origin_of(u))
            normalized_links.append(u)
            added += 1
            # Optional queue hint
            try:
                if hasattr(traversal, "enqueue"):
                    traversal.enqueue(u)  # type: ignore[attr-defined]
                elif hasattr(traversal, "seed"):
                    traversal.seed(u)  # type: ignore[attr-defined]
            except Exception:
                pass
        except Exception:
            # best-effort; skip bad links
            continue

    return {"ok": True, "current_url": current_url, "added": added, "links": normalized_links}


def run():
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)


if __name__ == "__main__":
    run()
