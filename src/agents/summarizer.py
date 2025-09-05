from agents.base import Agent
from llm import build_chat_llm

class SummarizerAgent(Agent):
    name = "summarizer"
    description = "Summarizes the current page into Markdown"

    async def run(self, context: dict):
        page_text = "\n".join([c.get("text","") for c in context.get("controls", [])])
        llm = build_chat_llm()
        resp = llm.invoke(
            "Summarize the following page content into clear Markdown bullets:\n" + page_text[:4000]
        )
        return {"summary": resp.content}
