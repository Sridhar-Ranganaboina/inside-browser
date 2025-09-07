
from __future__ import annotations
from typing import Dict, Any, List, Tuple

Step = Dict[str, Any]

def _step_key(s: Step) -> Tuple:
    return (
        s.get("action"),
        s.get("selector"),
        (s.get("query") or {}).get("role"),
        (s.get("query") or {}).get("name"),
        s.get("text"),
        s.get("url"),
        bool(s.get("enter")),
    )

def _collapse_typing(steps: List[Step]) -> List[Step]:
    out: List[Step] = []
    for s in steps:
        if s.get("action") == "type" and out and _step_key(out[-1]) == _step_key(s):
            out[-1] = s
            continue
        out.append(s)
    return out

def _prefer_enter_on_search(steps: List[Step]) -> List[Step]:
    out: List[Step] = []
    i = 0
    while i < len(steps):
        s = steps[i]
        if (
            s.get("action") == "type"
            and not s.get("enter")
            and i + 1 < len(steps)
            and steps[i + 1].get("action") == "pressEnter"
        ):
            merged = dict(s)
            merged["enter"] = True
            out.append(merged)
            i += 2
            continue
        out.append(s)
        i += 1
    return out

def normalize_plan(raw_steps: List[Step]) -> List[Step]:
    allowed = {"navigate", "click", "type", "pressEnter", "waitForText", "scroll", "done"}
    steps = [s for s in raw_steps or [] if s.get("action") in allowed]

    seen = set()
    unique: List[Step] = []
    for s in steps:
        k = _step_key(s)
        if k in seen: 
            continue
        seen.add(k)
        unique.append(s)

    unique = _collapse_typing(unique)
    unique = _prefer_enter_on_search(unique)
    return unique
