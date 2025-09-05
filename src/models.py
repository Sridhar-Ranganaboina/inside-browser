from typing import List, Optional
from sqlmodel import SQLModel, Field
from pydantic import BaseModel

# Action / Plan
class ActionModel(BaseModel):
    action: str
    selector: Optional[str] = None
    query: Optional[dict] = None  # {role, name}
    text: Optional[str] = None
    url: Optional[str] = None
    enter: Optional[bool] = None
    times: Optional[int] = None
    direction: Optional[str] = None

class PlanModel(BaseModel):
    steps: List[ActionModel]

# Persistence
class Node(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    url: str
    title: Optional[str] = None
    origin: Optional[str] = None

class Edge(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    from_node_id: int
    to_node_id: int
    via_selector: Optional[str] = None
    label: Optional[str] = None

class ActionRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    node_id: Optional[int] = None
    action_type: Optional[str] = None
    selector: Optional[str] = None
    text: Optional[str] = None
    success: Optional[bool] = None
