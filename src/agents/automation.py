from agents.base import Agent
from planner import generate_plan

class AutomationAgent(Agent):
    name = "automation"
    description = "Executes actions on the current page"

    async def run(self, context: dict):
        prompt = context.get("task", "")
        dom = context.get("dom", [])
        plan = await generate_plan(prompt, dom)
        return {"steps": [s.dict() for s in plan.steps]}
