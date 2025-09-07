
from typing import List, Dict, Any
from models import PlanModel, ActionModel
from plan_tools import normalize_plan

# Very light heuristic planner so it works offline. Replace with LLM if desired.
def _is_search_prompt(p: str) -> bool:
    return any(x in p.lower() for x in ["search for", "find ", "look up", "google "])

def _extract_query(p: str) -> str:
    p = p.strip()
    for kw in ["search for", "find", "look up", "google"]:
        if kw in p.lower():
            idx = p.lower().find(kw)
            return p[idx + len(kw):].strip().strip('"').strip("'")
    return p

async def generate_plan(prompt: str, dom: List[Dict[str, Any]]) -> PlanModel:
    steps: List[Dict[str, Any]] = []

    if _is_search_prompt(prompt):
        q = _extract_query(prompt)
        # prefer role combobox/textbox with name "Search" or "search"
        steps = [
            {"action": "click", "query": {"role": "combobox", "name": "Search"}},
            {"action": "type",  "query": {"role": "combobox", "name": "Search"}, "text": q, "enter": True},
            {"action": "waitForText", "text": q},
            {"action": "done"}
        ]
    else:
        # Fallback: no-op plan to avoid loops; front-end will re-ask next
        steps = [{"action": "done"}]

    norm = normalize_plan(steps)
    return PlanModel(steps=[ActionModel(**s) for s in norm])
