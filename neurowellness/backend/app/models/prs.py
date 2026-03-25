from pydantic import BaseModel
from typing import Any, Dict, List, Optional


class ScaleOut(BaseModel):
    id: str
    scale_id: str
    name: str
    short_name: Optional[str] = None
    description: Optional[str] = None
    scoring_type: str
    max_score: Optional[float] = None


class QuestionOut(BaseModel):
    id: str
    question_index: int
    question_text: str
    question_type: str
    options: Optional[List[Dict[str, Any]]] = None
    is_required: bool = True
    scored_in_total: bool = True
