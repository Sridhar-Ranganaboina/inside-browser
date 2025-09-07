# src/agents/summarizer.py
from typing import Dict, Any
from llm import build_chat_llm

class SummarizerAgent:
    async def run(self, context: Dict[str, Any]) -> str:
        """Summarize page text passed from the extension."""
        text = (context.get("text") or "").strip()
        title = (context.get("title") or "").strip()
        url = (context.get("url") or "").strip()

        if not text:
            return "No page text was provided to summarize."

        llm = build_chat_llm()
        prompt = (
            f"Summarize the following web page for a busy reader. "
            f"Use bullets, highlight key facts, and include the page title if present.\n\n"
            f"TITLE: {title}\nURL: {url}\n\n"
            f"CONTENT:\n{text}\n\n"
            "Return concise Markdown."
        )
        # LangChain's AzureChatOpenAI implements .invoke
        resp = llm.invoke(prompt)
        return getattr(resp, "content", str(resp))