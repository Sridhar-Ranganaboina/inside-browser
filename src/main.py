import uvicorn
from fastapi import FastAPI
from typing import Dict, Any
from persistence import init_db, upsert_node
from planner import generate_plan
from agents.summarizer import SummarizerAgent
from bookmarks import BOOKMARKS
from models import PlanModel

app = FastAPI(title="Commet Assistant")

init_db()

@app.post("/plan")
async def plan_endpoint(payload: Dict[str, Any]):
    prompt = payload.get("prompt", "")
    dom = payload.get("dom", [])
    return (await generate_plan(prompt, dom)).model_dump()

@app.post("/next")
async def next_endpoint(payload: Dict[str, Any]):
    dom = payload.get("dom", [])
    prompt = payload.get("prompt", "continue")
    return (await generate_plan(prompt, dom)).model_dump()

@app.post("/summarize")
async def summarize(payload: Dict[str, Any]):
    agent = SummarizerAgent()
    return await agent.run(payload)

@app.post("/run_bookmark")
async def run_bookmark(payload: Dict[str, Any]):
    name = payload.get("bookmark")
    return {"steps": BOOKMARKS.get(name, [])}

def run():
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
