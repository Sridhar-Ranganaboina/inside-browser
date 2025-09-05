from agents.base import Agent

BOOKMARKS = {
    "create_change_request": [
        {"action":"click", "query":{"role":"button","name":"Create"}},
        {"action":"type", "query":{"role":"textbox","name":"Title"}, "text":"Sample Change"},
        {"action":"click", "query":{"role":"button","name":"Submit"}}
    ]
}

class BookmarksAgent(Agent):
    name = "bookmarks"
    description = "Runs pre-defined workflows"

    async def run(self, context: dict):
        name = context.get("bookmark")
        if name in BOOKMARKS:
            return {"steps": BOOKMARKS[name]}
        return {"error": f"Bookmark {name} not found"}
