from agents.base import Agent
from llm import build_chat_llm

class SummarizerAgent(Agent):
    name = "summarizer"
    description = "Summarizes current page content"

    async def run(self, context: dict):
        llm = build_chat_llm()
        text = " ".join([c.get("text","") for c in context.get("controls",[])])
        prompt = f"Summarize this page in markdown:\n{text[:3000]}"
        resp = llm.invoke(prompt)
        return {"summary": resp.content}
