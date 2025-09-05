import json
from models import PlanModel, ActionModel
from llm import build_chat_llm

async def generate_plan(task: str, dom_snapshot: list) -> PlanModel:
    llm = build_chat_llm()
    prompt = f"""
You are a browser automation planner.
User task: "{task}"
DOM snapshot (elements with tag, text, selector, role, name): {json.dumps(dom_snapshot[:100])}

Rules:
- Return JSON only: {{"steps":[...]}}
- Each step: action ∈ navigate|click|type|waitForText|scroll|pressEnter|done
- Prefer query: {{"role": "...", "name": "..."}} over CSS selectors.
- If typing into a search box, set enter:true to submit.
- Be concise, 2-6 steps.
"""
    resp = llm.invoke(prompt)
    try:
        parsed = json.loads(resp.content)
        steps = [ActionModel(**s) for s in parsed.get("steps", [])]
        return PlanModel(steps=steps)
    except Exception:
        return PlanModel(steps=[])
