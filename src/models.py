
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class ActionModel(BaseModel):
    action: str
    selector: Optional[str] = None
    query: Optional[Dict[str, Any]] = None
    text: Optional[str] = None
    url: Optional[str] = None
    enter: Optional[bool] = None
    times: Optional[int] = None
    direction: Optional[str] = None

class PlanModel(BaseModel):
    steps: List[ActionModel] = Field(default_factory=list)
