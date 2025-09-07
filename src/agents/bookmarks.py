
from typing import Dict, Any

class BookmarksAgent:
    async def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        # Example: return canned steps for a named bookmark
        name = payload.get("name") or ""
        if name == "create_change_request":
            return {
                "name": name,
                "steps": [
                    {"action": "click", "query": {"role": "button", "name": "Create"}},
                    {"action": "click", "query": {"role": "link", "name": "Change Request"}},
                    {"action": "done"}
                ]
            }
        return {"name": name, "steps": []}
