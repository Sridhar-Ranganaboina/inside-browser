from typing import List, Set, Optional
from persistence import upsert_node, add_edge

class FrontierItem:
    def __init__(self, url: str, from_url: str | None = None, selector: str | None = None, depth: int = 0):
        self.url = url
        self.from_url = from_url
        self.selector = selector
        self.depth = depth

class TraversalManager:
    def __init__(self, max_depth: int = 3):
        self.frontier: List[FrontierItem] = []
        self.visited: Set[str] = set()
        self.max_depth = max_depth

    def seed(self, start_url: str):
        self.frontier.append(FrontierItem(url=start_url, depth=0))

    def push_links(self, current_url: str, links: List[str], via_selector: str | None = None, depth: int = 0):
        for l in links:
            if l in self.visited: continue
            if depth + 1 > self.max_depth: continue
            self.frontier.append(FrontierItem(url=l, from_url=current_url, selector=via_selector, depth=depth+1))

    def next(self) -> Optional[FrontierItem]:
        while self.frontier:
            item = self.frontier.pop(0)
            if item.url not in self.visited:
                return item
        return None

    def mark_visited(self, url: str):
        self.visited.add(url)
        upsert_node(url=url, title=None, origin=None)

    def record_edge(self, from_url: str, to_url: str, selector: str | None, label: str | None):
        from_node = upsert_node(url=from_url, title=None, origin=None)
        to_node = upsert_node(url=to_url, title=None, origin=None)
        add_edge(from_node.id, to_node.id, via_selector=selector, label=label)
