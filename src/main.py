
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List
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

init_db()
traversal = TraversalManager(max_depth=4)

@app.post("/intent")
async def intent(payload: Dict[str, Any]):
    task = payload.get("task", "") or ""
    context = payload.get("context", {}) or {}
    if "summary" in task.lower() or "summarize" in task.lower():
        agent = SummarizerAgent()
        return {"type": "summary", "result": await agent.run(context)}
    elif "bookmark" in payload:
        agent = BookmarksAgent()
        return {"type": "bookmark", "result": await agent.run(payload)}
    else:
        agent = AutomationAgent()
        return {"type": "automation", "result": await agent.run({"task":task,"dom":context.get("controls",[])})}

@app.post("/plan")
async def plan_endpoint(payload: Dict[str, Any]):
    prompt = payload.get("prompt", "")
    dom = payload.get("dom", [])
    start_url = payload.get("start_url")
    if start_url:
        traversal.seed(start_url)
        upsert_node(url=start_url, title=None, origin=None)
    plan = await generate_plan(prompt, dom)
    return plan.model_dump()

@app.post("/next")
async def next_endpoint(payload: Dict[str, Any]):
    dom = payload.get("dom", [])
    prompt = payload.get("prompt", "continue")
    plan = await generate_plan(prompt, dom)
    return plan.model_dump()

@app.post("/explore")
async def explore(payload: Dict[str, Any]):
    current = payload.get("current_url") or ""
    links: List[str] = payload.get("links") or []
    traversal.push_links(current_url=current, links=links, via_selector=None, depth=0)
    return {"ok": True, "frontier_size": len(traversal.frontier)}

@app.post("/summarize")
async def summarize_endpoint(payload: Dict[str, Any]):
    task = (payload.get("task") or "Summarize this page").strip()
    ctx = payload.get("context") or {}
    text = (ctx.get("text") or "").strip()
    if not text:
        controls = ctx.get("dom") or []
        text = "\n".join([str(c.get("text") or "") for c in controls if c.get("text")]).strip()
    agent = SummarizerAgent()
    summary = await agent.run({"text": text, "title": ctx.get("title"), "url": ctx.get("url")})
    return {"summary": summary}

@app.get("/bookmarks")
async def list_bookmarks():
    return {"bookmarks":["create_change_request"]}

@app.post("/run_bookmark")
async def run_bookmark(payload: Dict[str, Any]):
    agent = BookmarksAgent()
    return await agent.run(payload)

def run():
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)

if __name__ == "__main__":
    run()
