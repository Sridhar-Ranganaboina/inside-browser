import json
from typing import List, Dict, Any
from llm import build_chat_llm
from models import PlanModel, ActionModel

async def generate_plan(task: str, dom_snapshot: List[Dict[str, Any]]) -> PlanModel:
    llm = build_chat_llm()
    schema = {
        "type": "object",
        "properties": {
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string"},
                        "selector": {"type": "string"},
                        "text": {"type": "string"},
                        "url": {"type": "string"},
                        "query": {"type": "object"},
                        "enter": {"type": "boolean"}
                    },
                    "required": ["action"]
                }
            }
        }
    }
    prompt = f"""
You are a browser automation planner.
Task: {task}
DOM: {json.dumps(dom_snapshot[:100])}
Return JSON strictly matching: {json.dumps(schema)}
"""
    resp = llm.invoke(prompt)
    try:
        parsed = json.loads(resp.content)
        steps = [ActionModel(**s) for s in parsed.get("steps", [])]
        return PlanModel(steps=steps)
    except Exception:
        return PlanModel(steps=[])
