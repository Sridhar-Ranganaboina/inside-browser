from __future__ import annotations
import json
import re
from typing import List, Dict, Any, Optional
from models import PlanModel, ActionModel
from plan_tools import normalize_plan

# We keep your existing heuristic as an offline fallback
def _is_search_prompt(p: str) -> bool:
    return any(x in p.lower() for x in ["search for", "find ", "look up", "google "])

def _extract_query(p: str) -> str:
    p = p.strip()
    for kw in ["search for", "find", "look up", "google"]:
        if kw in p.lower():
            idx = p.lower().find(kw)
            return p[idx + len(kw):].strip().strip('"').strip("'")
    return p

# --------- LLM plumbing ---------
def _safe_json_from_text(text: str) -> Optional[Dict[str, Any]]:
    """
    Extract the first top-level JSON object from a possibly messy LLM response.
    Returns None if parsing fails.
    """
    if not text:
        return None
    # common cases: markdown fenced code, extra commentary
    # try direct parse first
    try:
        return json.loads(text)
    except Exception:
        pass

    # strip code fences
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if m:
        snippet = m.group(0)
        try:
            return json.loads(snippet)
        except Exception:
            return None
    return None

def _summarize_dom(dom: List[Dict[str, Any]], limit: int = 180) -> List[Dict[str, Any]]:
    """
    Shrink the DOM snapshot to keep token usage sane while still being useful.
    Keep fields the planner truly needs.
    """
    slim = []
    for c in dom[:limit]:
        slim.append({
            "tag": str(c.get("tag") or "")[:30],
            "role": c.get("role"),
            "name": (c.get("name") or "").strip()[:120],
            "text": (c.get("text") or "").strip()[:120],
            "href": c.get("href"),
            "selector": c.get("selector"),
        })
    return slim

def _search_hints(dom: List[Dict[str, Any]], limit: int = 8) -> List[Dict[str, Any]]:
    """
    Provide a few likely search inputs (role textbox/combobox with 'search' cues)
    as hints to the planner, but keep the planner site-agnostic.
    """
    hints = []
    for c in dom:
        role = (c.get("role") or "").lower()
        name = (c.get("name") or "").lower()
        text = (c.get("text") or "").lower()
        is_searchish = ("search" in name) or ("search" in text)
        if role in ("textbox", "combobox") and is_searchish:
            hints.append({
                "role": role,
                "name": c.get("name"),
                "selector": c.get("selector"),
            })
            if len(hints) >= limit:
                break
    return hints

def _build_llm_prompt(user_goal: str, dom: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """
    Construct a strict, JSON-only planning prompt.
    """
    slim = _summarize_dom(dom)
    hints = _search_hints(dom)

    system = (
        "You are a web-automation planner. Your job is to convert the user's goal "
        "and the current page snapshot into a SHORT sequence of concrete UI actions.\n\n"
        "Allowed actions:\n"
        "  - navigate: { url }\n"
        "  - click:    { selector? or query:{role,name} }\n"
        "  - type:     { text, enter?:boolean, selector? or query:{role,name} }\n"
        "  - pressEnter\n"
        "  - waitForText: { text, timeout?: number }\n"
        "  - scroll:   { direction:'down'|'up', times?:number }\n"
        "  - done\n\n"
        "Target elements must be identified by either a CSS 'selector' from the snapshot, "
        "OR a semantic 'query' with {role, name}. Roles are generic (textbox, button, link, combobox). "
        "The 'name' is the accessible label / placeholder / visible text from the DOM snapshot.\n\n"
        "CRITICAL RULES:\n"
        "  1) Output ONLY JSON: {\"steps\":[ ... ]}. No markdown or extra text.\n"
        "  2) DO NOT type meta-instructions like 'search for items with rating >4 and add to cart'. "
        "     Extract concrete queries (e.g., 'washing machine') and then add follow-up steps (filters, add-to-cart, etc.).\n"
        "  3) Prefer typing into a visible 'Search' textbox/combobox and pressing Enter.\n"
        "  4) If the goal has multiple sub-tasks, plan them in order (search → filter → add to cart → open orders → check ...), "
        "     using the available controls.\n"
        "  5) Keep the plan short and avoid repeating identical actions.\n"
        "  6) If you cannot find a control for a sub-task, plan the most reasonable next step anyway "
        "     (e.g., type a search, then click a likely link text).\n"
    )

    # a tiny, generic example to set the shape (site-agnostic)
    example = {
        "steps": [
            {"action": "click", "query": {"role": "textbox", "name": "Search"}},
            {"action": "type", "query": {"role": "textbox", "name": "Search"}, "text": "washing machine", "enter": True},
            {"action": "waitForText", "text": "washing"},
            {"action": "click", "query": {"role": "link", "name": "4★ & above"}},
            {"action": "click", "query": {"role": "button", "name": "Add to Cart"}},
            {"action": "click", "query": {"role": "link", "name": "Orders"}},
            {"action": "done"}
        ]
    }

    user = (
        f"USER_GOAL:\n{user_goal}\n\n"
        f"SNAPSHOT_CONTROLS (trimmed):\n{json.dumps(slim, ensure_ascii=False)}\n\n"
        f"HINTS (possible search inputs):\n{json.dumps(hints, ensure_ascii=False)}\n\n"
        "Return only JSON in this exact shape:\n"
        + json.dumps(example, ensure_ascii=False)
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


# We import your LLM builder (Azure OpenAI via LangChain), but keep it optional.
def _build_llm():
    try:
        from llm import build_chat_llm
        return build_chat_llm()
    except Exception:
        return None


async def _llm_plan(prompt: str, dom: List[Dict[str, Any]]) -> Optional[List[Dict[str, Any]]]:
    """
    Ask the LLM to produce a multi-step JSON plan. Returns a list of raw action dicts or None.
    """
    llm = _build_llm()
    if llm is None:
        return None

    messages = _build_llm_prompt(prompt, dom)
    try:
        # LangChain ChatModels accept list[dict] as messages in .invoke for recent versions.
        resp = llm.invoke(messages)
        text = getattr(resp, "content", None) or (resp if isinstance(resp, str) else None)
        data = _safe_json_from_text(text or "")
        steps = data.get("steps") if isinstance(data, dict) else None
        if isinstance(steps, list) and steps:
            return steps
        return None
    except Exception:
        return None


# --------- Public API (called by FastAPI endpoints) ---------
async def generate_plan(prompt: str, dom: List[Dict[str, Any]]) -> PlanModel:
    """
    Multi-step, site-agnostic planner.
    - First, try LLM to decompose and plan.
    - If unavailable or invalid, fall back to your previous heuristic.
    - Always normalize and return PlanModel.
    """
    # 1) Try LLM
    steps: Optional[List[Dict[str, Any]]] = await _llm_plan(prompt, dom)

    # 2) Offline fallback (your original logic)
    if not steps:
        if _is_search_prompt(prompt):
            q = _extract_query(prompt)
            steps = [
                {"action": "click", "query": {"role": "combobox", "name": "Search"}},
                {"action": "type",  "query": {"role": "combobox", "name": "Search"}, "text": q, "enter": True},
                {"action": "waitForText", "text": q},
                {"action": "done"},
            ]
        else:
            steps = [{"action": "done"}]

    # 3) Normalize (dedupe, clamp, coerce types) using your existing tool
    normalized = normalize_plan(steps)

    return PlanModel(steps=[ActionModel(**s) for s in normalized])
