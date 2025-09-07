
from typing import List, Optional

class TraversalManager:
    def __init__(self, max_depth: int = 3):
        self.frontier: List[str] = []
        self.max_depth = max_depth

    def seed(self, url: str):
        if url and url not in self.frontier:
            self.frontier.append(url)

    def push_links(self, current_url: str, links: List[str], via_selector: Optional[str], depth: int):
        if depth >= self.max_depth:
            return
        for u in links or []:
            if u and u not in self.frontier:
                self.frontier.append(u)
