# NEUROWELLNESS — CLAUDE CODE MASTER PROMPT FILE
# =====================================================
# Give this entire file to Claude Code.
# Run from the root of your project: neurowellness/
# Prerequisites:
#   1. Supabase project created
#   2. SQL from 01_SUPABASE_DB_SETUP.sql executed in Supabase
#   3. .env files filled in with your Supabase credentials
#   4. prs-main/ folder (original prototype) available at ../prs-main/
# =====================================================

# =====================================================
# MASTER PROMPT — PASTE THIS INTO CLAUDE CODE
# =====================================================

You are building the NeuroWellness application — a production-ready neuromodulation
PRS (Patient Rating System) clinical portal. The project has two portals: Doctor and
Patient. I have already created the Supabase database schema manually. Your job is to
build the complete working application from scratch.

## PROJECT CONTEXT
- Frontend: React + Vite + Zustand + React Router v6
- Backend: Python FastAPI + Supabase (service key for DB ops)
- Auth: Supabase Auth (frontend ↔ Supabase directly; backend validates JWT)
- DB: Already set up in Supabase (tables: profiles, doctors, patients, sessions,
  prs_scales, prs_questions, prs_conditions, assessment_permissions,
  assessment_sessions, assessment_responses, assessment_scores, notifications,
  audit_logs, doctor_patient_allocations)
- The original prototype JS files are at: ../prs-main/
  (scale engine logic, 47 scale JSON files, conditionMap.json)

## STEP 1 — CREATE PROJECT STRUCTURE

Create this exact directory structure:

```
neurowellness/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── dependencies.py
│   │   ├── middleware/
│   │   │   ├── __init__.py
│   │   │   └── logging.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── common.py
│   │   │   ├── user.py
│   │   │   ├── prs.py
│   │   │   └── session.py
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── doctors.py
│   │   │   ├── patients.py
│   │   │   ├── notifications.py
│   │   │   └── prs/
│   │   │       ├── __init__.py
│   │   │       ├── scales.py
│   │   │       ├── conditions.py
│   │   │       ├── permissions.py
│   │   │       ├── assessment.py
│   │   │       └── scores.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── scale_engine.py
│   │   │   ├── allocation.py
│   │   │   └── notification.py
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── responses.py
│   │       └── exceptions.py
│   ├── scripts/
│   │   └── seed_scales.py
│   ├── tests/
│   │   ├── __init__.py
│   │   └── test_scale_engine.py
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── Makefile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── lib/
│   │   │   ├── supabase.js
│   │   │   └── api.js
│   │   ├── store/
│   │   │   ├── authStore.js
│   │   │   ├── prsStore.js
│   │   │   └── uiStore.js
│   │   ├── hooks/
│   │   │   └── useAuth.js
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   │   ├── LoginPage.jsx
│   │   │   │   └── RegisterPage.jsx
│   │   │   ├── doctor/
│   │   │   │   ├── DoctorDashboard.jsx
│   │   │   │   ├── PatientList.jsx
│   │   │   │   └── PatientDetail.jsx
│   │   │   ├── patient/
│   │   │   │   ├── PatientDashboard.jsx
│   │   │   │   ├── MyAssessments.jsx
│   │   │   │   └── MyScores.jsx
│   │   │   └── prs/
│   │   │       └── AssessmentPage.jsx
│   │   └── components/
│   │       ├── layout/
│   │       │   ├── DoctorLayout.jsx
│   │       │   ├── PatientLayout.jsx
│   │       │   └── Navbar.jsx
│   │       ├── prs/
│   │       │   ├── ScaleRunner.jsx
│   │       │   ├── QuestionRenderer.jsx
│   │       │   └── ScoreCard.jsx
│   │       └── common/
│   │           ├── ProtectedRoute.jsx
│   │           └── LoadingSpinner.jsx
│   ├── public/
│   ├── index.html
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── Makefile
└── README.md
```

---

## STEP 2 — BACKEND: requirements.txt

Create backend/requirements.txt:
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
pydantic==2.7.4
pydantic-settings==2.3.4
supabase==2.5.3
python-jose[cryptography]==3.3.0
python-multipart==0.0.9
httpx==0.27.0
structlog==24.2.0
python-dotenv==1.0.1
slowapi==0.1.9
pytest==8.2.2
pytest-asyncio==0.23.7
ruff==0.4.10
```

---

## STEP 3 — BACKEND: config.py

Create backend/app/config.py:

```python
from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase
    SUPABASE_URL: str
    SUPABASE_KEY: str          # anon key
    SUPABASE_SERVICE_KEY: str  # service role key (backend only, never expose)
    JWT_SECRET: str            # from Supabase Settings → API → JWT Settings

    # App
    ENVIRONMENT: str = "development"
    API_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

---

## STEP 4 — BACKEND: database.py

Create backend/app/database.py:

```python
from functools import lru_cache
from supabase import create_client, Client
from app.config import get_settings


@lru_cache()
def get_supabase() -> Client:
    """Anon client — for user-context operations (respects RLS)"""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


@lru_cache()
def get_supabase_admin() -> Client:
    """Service role client — bypasses RLS, backend use only"""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
```

---

## STEP 5 — BACKEND: dependencies.py

Create backend/app/dependencies.py:

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from app.config import get_settings
from app.database import get_supabase_admin

security = HTTPBearer()
settings = get_settings()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Validate Supabase JWT and return user payload"""
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Get role from profiles table
        admin = get_supabase_admin()
        result = admin.table("profiles").select("id, role, full_name, email, is_active").eq("id", user_id).single().execute()

        if not result.data:
            raise HTTPException(status_code=401, detail="User profile not found")

        profile = result.data
        if not profile.get("is_active"):
            raise HTTPException(status_code=403, detail="Account is deactivated")

        return {
            "id": user_id,
            "email": profile["email"],
            "role": profile["role"],
            "full_name": profile["full_name"],
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate token")


def require_role(allowed_roles: list):
    async def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required roles: {allowed_roles}"
            )
        return current_user
    return role_checker


require_doctor = require_role(["doctor", "admin"])
require_patient = require_role(["patient"])
require_admin = require_role(["admin"])
```

---

## STEP 6 — BACKEND: utils/responses.py and utils/exceptions.py

Create backend/app/utils/responses.py:

```python
from typing import Any, Optional
from fastapi.responses import JSONResponse


def success_response(
    data: Any = None,
    message: str = "Success",
    status_code: int = 200,
    meta: Optional[dict] = None,
) -> dict:
    response = {"success": True, "message": message, "data": data}
    if meta:
        response["meta"] = meta
    return response


def paginated_response(
    items: list,
    total: int,
    skip: int,
    limit: int,
    message: str = "Success",
) -> dict:
    return {
        "success": True,
        "message": message,
        "data": items,
        "meta": {
            "total": total,
            "skip": skip,
            "limit": limit,
            "has_more": (skip + limit) < total,
        },
    }
```

Create backend/app/utils/exceptions.py:

```python
from fastapi import HTTPException


class NotFoundError(HTTPException):
    def __init__(self, detail: str = "Resource not found"):
        super().__init__(status_code=404, detail=detail)


class ForbiddenError(HTTPException):
    def __init__(self, detail: str = "Access denied"):
        super().__init__(status_code=403, detail=detail)


class ConflictError(HTTPException):
    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(status_code=409, detail=detail)


class BadRequestError(HTTPException):
    def __init__(self, detail: str = "Bad request"):
        super().__init__(status_code=400, detail=detail)
```

---

## STEP 7 — BACKEND: services/scale_engine.py

Create backend/app/services/scale_engine.py — a complete Python port of the
original JavaScript scaleEngine.js (located at ../prs-main/js/scaleEngine.js).

The scale engine must handle ALL scoring types found in the 47 scale JSON files:
- sum (GAD-7, PHQ-9, ISI, FSS, etc.)
- sum-numeric (MIDAS — numeric day count inputs)
- subscale-sum (DASS-21 — per subscale then multiply)
- subscale-severity (DASS-21 variant with per-subscale severity)
- fiqr-weighted (FIQR — domain groups with divisors)
- weighted-domain-sum (COMPASS-31 — domains with multipliers)
- component-sum (PSQI — multi-formula component scoring)
- profile-and-vas (EQ-5D-5L — health state profile + VAS slider)
- weighted-binary (LANSS, DN4 — binary yes/no with points, has cutoff)
- binary_cutoff (screening scales with pass/fail cutoff)
- reverse-scored (RAADS-14 — some items scored in reverse)
- clinician (EDSS, MADRS, HDRS — clinician-rated scales)
- single-selection (KPS — single item selection)
- mean (average of responses)
- vas-mean (VAS slider average)
- nrs (numeric rating scale)
- sum-subscales (alias for subscale-sum)
- asrs-screening (ASRS — part A/B screening logic)
- ibs-sss (IBS severity scoring system)
- paindetect (painDETECT — combination pain descriptor + radiation)
- pfs-dual (PFS-16 — cognitive and physical fatigue subscales)
- msq-transformed (MSQ — transformed domain scoring)
- weighted-sum (general weighted item sum)

```python
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import math


@dataclass
class ScoreResult:
    total: float
    max_possible: float
    question_scores: Dict[int, float] = field(default_factory=dict)
    subscale_scores: Dict[str, Any] = field(default_factory=dict)
    domain_scores: Dict[str, Any] = field(default_factory=dict)
    component_scores: Dict[str, Any] = field(default_factory=dict)
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SeverityResult:
    level: str
    label: str
    description: str = ""
    min_score: float = 0
    max_score: float = 0


@dataclass
class RiskFlag:
    message: str
    priority: str = "moderate"   # 'low' | 'moderate' | 'high'
    question_index: Optional[int] = None
    value: Any = None
    source: str = ""


class ScaleEngine:

    def calculate_score(self, scale_config: dict, responses: Dict[int, Any]) -> ScoreResult:
        scoring_type = scale_config.get("scoringType") or scale_config.get("scoringMethod") or "sum"
        handler = getattr(self, f"_score_{scoring_type.replace('-', '_')}", self._score_sum)
        return handler(responses, scale_config)

    def get_severity(self, scale_config: dict, total_score: float) -> Optional[SeverityResult]:
        bands = scale_config.get("severityBands", [])
        for band in bands:
            if band.get("min", 0) <= total_score <= band.get("max", float("inf")):
                return SeverityResult(
                    level=band.get("level", "unknown"),
                    label=band.get("label", ""),
                    description=band.get("description", ""),
                    min_score=band.get("min", 0),
                    max_score=band.get("max", 0),
                )
        return None

    def detect_risk_flags(self, scale_config: dict, responses: Dict[int, Any], score_result: ScoreResult) -> List[RiskFlag]:
        flags = []
        scale_id = scale_config.get("id", "")
        risk_rules = scale_config.get("riskRules", [])

        for rule in risk_rules:
            rule_type = rule.get("type", "threshold")

            if rule_type == "item_threshold":
                q_idx = rule.get("questionIndex")
                if q_idx is not None and q_idx in responses:
                    val = self._to_float(responses[q_idx])
                    operator = rule.get("operator", ">=")
                    threshold = rule.get("threshold", 0)
                    triggered = self._compare(val, operator, threshold)
                    if triggered:
                        flags.append(RiskFlag(
                            message=rule.get("message", f"Risk flag on question {q_idx}"),
                            priority=rule.get("priority") or rule.get("severity", "moderate"),
                            question_index=q_idx,
                            value=val,
                            source=scale_id,
                        ))

            elif rule_type == "total_threshold":
                val = score_result.total
                operator = rule.get("operator", ">=")
                threshold = rule.get("threshold", 0)
                if self._compare(val, operator, threshold):
                    flags.append(RiskFlag(
                        message=rule.get("message", "Score exceeds risk threshold"),
                        priority=rule.get("priority") or rule.get("severity", "moderate"),
                        value=val,
                        source=scale_id,
                    ))

            elif rule_type == "functionalImpairment" or rule.get("condition") == "functionalImpairment":
                # Check functional impairment question (usually last non-scored Q)
                threshold = rule.get("threshold", 2)
                for q_idx, val in responses.items():
                    f_val = self._to_float(val)
                    if f_val >= threshold:
                        questions = scale_config.get("questions", [])
                        if q_idx < len(questions):
                            q = questions[q_idx]
                            if not q.get("scoredInTotal", True):
                                flags.append(RiskFlag(
                                    message=rule.get("message", "Significant functional impairment reported"),
                                    priority=rule.get("priority", "moderate"),
                                    question_index=q_idx,
                                    value=f_val,
                                    source=scale_id,
                                ))
                                break

        return flags

    # -------------------------------------------------------
    # SCORING HANDLERS
    # -------------------------------------------------------

    def _score_sum(self, responses: dict, config: dict) -> ScoreResult:
        total = 0.0
        question_scores = {}
        scored_questions = config.get("scoredQuestions")

        for i, question in enumerate(config.get("questions", [])):
            if scored_questions is not None and i not in scored_questions:
                continue
            if question.get("scoredInTotal") is False:
                continue
            if question.get("includeInScore") is False:
                continue
            if question.get("supplementary") is True:
                continue

            val = responses.get(i)
            if val is not None and val != "":
                num = self._to_float(val)
                if num is not None:
                    points = self._get_option_points(question, val, num)
                    total += points
                    question_scores[i] = points

        return ScoreResult(
            total=round(total, 2),
            max_possible=config.get("maxScore") or self._calc_max_score(config),
            question_scores=question_scores,
        )

    def _score_sum_numeric(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_sum(responses, config)

    def _score_sum_subscales(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_subscale_sum(responses, config)

    def _score_weighted_sum(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_sum(responses, config)

    def _score_mean(self, responses: dict, config: dict) -> ScoreResult:
        result = self._score_sum(responses, config)
        answered = len([v for v in responses.values() if v is not None and v != ""])
        if answered > 0:
            result.total = round(result.total / answered, 2)
        return result

    def _score_vas_mean(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_mean(responses, config)

    def _score_nrs(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_sum(responses, config)

    def _score_single_selection(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_sum(responses, config)

    def _score_clinician(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_sum(responses, config)

    def _score_binary_cutoff(self, responses: dict, config: dict) -> ScoreResult:
        result = self._score_sum(responses, config)
        cutoff = config.get("cutoff")
        result.extra["is_positive"] = result.total >= cutoff if cutoff is not None else None
        result.extra["cutoff"] = cutoff
        return result

    def _score_weighted_binary(self, responses: dict, config: dict) -> ScoreResult:
        total = 0.0
        question_scores = {}
        for i, question in enumerate(config.get("questions", [])):
            val = responses.get(i)
            if val is not None:
                points = self._get_option_points(question, val, 0)
                total += points
                question_scores[i] = points
        cutoff = config.get("cutoff")
        max_possible = config.get("maxScore") or self._calc_max_score(config)
        return ScoreResult(
            total=total,
            max_possible=max_possible,
            question_scores=question_scores,
            extra={"is_positive": total >= cutoff if cutoff is not None else None, "cutoff": cutoff},
        )

    def _score_reverse_scored(self, responses: dict, config: dict) -> ScoreResult:
        total = 0.0
        question_scores = {}
        reverse_items = config.get("reverseItems", [])
        max_item = config.get("maxItemScore", 3)

        for i, question in enumerate(config.get("questions", [])):
            val = responses.get(i)
            if val is not None and val != "":
                num = self._to_float(val)
                if num is not None:
                    if i in reverse_items:
                        num = max_item - num
                    total += num
                    question_scores[i] = num

        return ScoreResult(
            total=round(total, 2),
            max_possible=config.get("maxScore") or self._calc_max_score(config),
            question_scores=question_scores,
            extra={"reverse_items": reverse_items},
        )

    def _score_subscale_sum(self, responses: dict, config: dict) -> ScoreResult:
        subscale_scores = {}
        total = 0.0

        for subscale in config.get("subscales", []):
            sub_total = 0.0
            for idx in subscale.get("questionIndices", []):
                val = responses.get(idx)
                if val is not None and val != "":
                    num = self._to_float(val)
                    if num is not None:
                        q = config["questions"][idx] if idx < len(config.get("questions", [])) else {}
                        points = self._get_option_points(q, val, num)
                        sub_total += points

            multiplier = subscale.get("multiplier", 1)
            final = round(sub_total * multiplier, 2)
            subscale_scores[subscale["id"]] = {
                "name": subscale.get("name", ""),
                "raw": sub_total,
                "multiplier": multiplier,
                "score": final,
            }
            total += final

        return ScoreResult(
            total=round(total, 2),
            max_possible=config.get("maxScore", 0),
            subscale_scores=subscale_scores,
        )

    def _score_subscale_severity(self, responses: dict, config: dict) -> ScoreResult:
        result = self._score_subscale_sum(responses, config)
        for sub_id, sub_data in result.subscale_scores.items():
            subscale_def = next((s for s in config.get("subscales", []) if s["id"] == sub_id), {})
            if subscale_def.get("severityBands"):
                sev = self.get_severity({"severityBands": subscale_def["severityBands"]}, sub_data["score"])
                result.subscale_scores[sub_id]["severity"] = sev.__dict__ if sev else None
        return result

    def _score_fiqr_weighted(self, responses: dict, config: dict) -> ScoreResult:
        domains = config.get("domains", {})
        domain_scores = {}
        total = 0.0

        for domain_id, domain in domains.items():
            raw = 0.0
            answered = 0
            for item_idx in domain.get("items", []):
                val = responses.get(item_idx)
                if val is not None and val != "":
                    num = self._to_float(val)
                    if num is not None:
                        raw += num
                        answered += 1
            divisor = domain.get("divisor", 1)
            score = round(raw / divisor, 2)
            domain_scores[domain_id] = {
                "name": domain.get("name", ""),
                "raw": raw,
                "divisor": divisor,
                "score": score,
                "max_weighted": domain.get("maxWeighted"),
                "items_answered": answered,
                "total_items": len(domain.get("items", [])),
            }
            total += score

        return ScoreResult(
            total=round(total, 2),
            max_possible=config.get("maxScore", 100),
            domain_scores=domain_scores,
        )

    def _score_weighted_domain_sum(self, responses: dict, config: dict) -> ScoreResult:
        domain_scores = {}
        total = 0.0

        for domain in config.get("domains", []):
            raw = 0.0
            max_raw = 0.0
            for idx in domain.get("questionIndices", []):
                q = config["questions"][idx] if idx < len(config.get("questions", [])) else {}
                val = responses.get(idx)
                if val is not None and val != "":
                    points = self._get_option_points(q, val, 0)
                    raw += points
                if q.get("options"):
                    max_points = max((o.get("points", o.get("value", 0)) for o in q["options"]), default=0)
                    max_raw += max_points

            multiplier = domain.get("multiplier", 1)
            weighted = round(raw * multiplier, 2)
            domain_scores[domain["id"]] = {
                "name": domain.get("name", ""),
                "raw": raw,
                "multiplier": multiplier,
                "weighted": weighted,
                "max_raw": max_raw,
                "max_weighted": domain.get("maxScore", round(max_raw * multiplier, 2)),
            }
            total += weighted

        return ScoreResult(
            total=round(total, 2),
            max_possible=config.get("maxScore", 100),
            domain_scores=domain_scores,
        )

    def _score_component_sum(self, responses: dict, config: dict) -> ScoreResult:
        """PSQI-style component scoring"""
        component_scores = {}
        total = 0.0

        for component in config.get("components", []):
            score = self._calculate_component_score(component, responses, config)
            component_scores[component["id"]] = {
                "name": component.get("name", ""),
                "description": component.get("description", ""),
                "score": score,
                "max_score": component.get("maxScore", 3),
            }
            total += score

        return ScoreResult(
            total=total,
            max_possible=config.get("maxScore", 21),
            component_scores=component_scores,
        )

    def _calculate_component_score(self, component: dict, responses: dict, config: dict) -> float:
        """PSQI component scoring logic"""
        comp_type = component.get("type", "item")
        if comp_type == "item":
            idx = component.get("questionIndex", 0)
            val = responses.get(idx)
            return self._to_float(val) or 0

        elif comp_type == "sum":
            total = 0.0
            for idx in component.get("questionIndices", []):
                val = responses.get(idx)
                num = self._to_float(val)
                if num is not None:
                    total += num
            return total

        elif comp_type == "sleep_efficiency":
            minutes_sleep = self._to_float(responses.get(component.get("minutesAsleepIndex", 5))) or 0
            minutes_bed = self._to_float(responses.get(component.get("minutesInBedIndex", 4))) or 0
            if minutes_bed > 0:
                efficiency = (minutes_sleep / minutes_bed) * 100
                if efficiency >= 85:
                    return 0
                elif efficiency >= 75:
                    return 1
                elif efficiency >= 65:
                    return 2
                else:
                    return 3
            return 0

        elif comp_type == "latency_sum":
            q1_val = self._to_float(responses.get(component.get("latencyIndex", 1))) or 0
            q5a_val = self._to_float(responses.get(component.get("item5aIndex", 5))) or 0
            combined = q1_val + q5a_val
            bands = component.get("scoringBands", [])
            for band in bands:
                if band["min"] <= combined <= band["max"]:
                    return band["score"]
            return 0

        elif comp_type == "duration":
            hours = self._to_float(responses.get(component.get("questionIndex", 4))) or 0
            if hours > 7:
                return 0
            elif hours >= 6:
                return 1
            elif hours >= 5:
                return 2
            else:
                return 3

        return 0

    def _score_profile_and_vas(self, responses: dict, config: dict) -> ScoreResult:
        """EQ-5D-5L: health state profile + VAS"""
        dimension_scores = {}
        health_state_profile = ""
        vas_score = None

        for i, question in enumerate(config.get("questions", [])):
            val = responses.get(i)
            if question.get("type") == "visual-analogue-scale":
                vas_score = self._to_float(val)
            elif question.get("dimension"):
                num = self._to_float(val) if val is not None else None
                dimension_scores[question["dimension"]] = {
                    "label": question.get("question") or question.get("label", ""),
                    "level": num,
                    "max_level": 5,
                }
                health_state_profile += str(int(num)) if num is not None else "X"

        return ScoreResult(
            total=vas_score or 0,
            max_possible=100,
            extra={
                "health_state_profile": health_state_profile,
                "dimension_scores": dimension_scores,
                "vas_score": vas_score,
                "is_profile_based": True,
            },
        )

    def _score_asrs_screening(self, responses: dict, config: dict) -> ScoreResult:
        """ASRS v1.1 Part A screening (Q1-6)"""
        screening_threshold = config.get("screeningThreshold", 4)
        part_a_questions = config.get("partA", list(range(6)))
        screening_positive = 0
        question_scores = {}

        for idx in part_a_questions:
            val = responses.get(idx)
            if val is not None:
                q = config["questions"][idx] if idx < len(config.get("questions", [])) else {}
                option = next((o for o in q.get("options", []) if str(o.get("value")) == str(val)), None)
                if option and option.get("screeningPositive"):
                    screening_positive += 1
                    question_scores[idx] = 1
                else:
                    question_scores[idx] = 0

        return ScoreResult(
            total=screening_positive,
            max_possible=len(part_a_questions),
            question_scores=question_scores,
            extra={
                "is_positive_screen": screening_positive >= screening_threshold,
                "screening_threshold": screening_threshold,
            },
        )

    def _score_ibs_sss(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_sum(responses, config)

    def _score_paindetect(self, responses: dict, config: dict) -> ScoreResult:
        result = self._score_sum(responses, config)
        cutoff_unlikely = config.get("cutoffUnlikely", 12)
        cutoff_likely = config.get("cutoffLikely", 19)
        total = result.total
        if total <= cutoff_unlikely:
            neuropathic_classification = "unlikely"
        elif total >= cutoff_likely:
            neuropathic_classification = "likely"
        else:
            neuropathic_classification = "possible"
        result.extra["neuropathic_classification"] = neuropathic_classification
        return result

    def _score_pfs_dual(self, responses: dict, config: dict) -> ScoreResult:
        """PFS-16 cognitive and physical fatigue subscales"""
        return self._score_subscale_sum(responses, config)

    def _score_msq_transformed(self, responses: dict, config: dict) -> ScoreResult:
        """MSQ transformed domain scoring"""
        return self._score_weighted_domain_sum(responses, config)

    # -------------------------------------------------------
    # HELPERS
    # -------------------------------------------------------

    def _to_float(self, val: Any) -> Optional[float]:
        try:
            return float(val)
        except (TypeError, ValueError):
            return None

    def _get_option_points(self, question: dict, val: Any, default: float) -> float:
        options = question.get("options", [])
        option = next((o for o in options if str(o.get("value")) == str(val)), None)
        if option and "points" in option:
            return float(option["points"])
        return default

    def _compare(self, val: float, operator: str, threshold: float) -> bool:
        ops = {">=": val >= threshold, ">": val > threshold,
               "<=": val <= threshold, "<": val < threshold,
               "==": val == threshold, "===": val == threshold}
        return ops.get(operator, False)

    def _calc_max_score(self, config: dict) -> float:
        total = 0.0
        scored_questions = config.get("scoredQuestions")
        for i, q in enumerate(config.get("questions", [])):
            if scored_questions is not None and i not in scored_questions:
                continue
            if q.get("scoredInTotal") is False or q.get("includeInScore") is False:
                continue
            if q.get("supplementary"):
                continue
            options = q.get("options", [])
            if options:
                max_points = max(
                    (o.get("points", o.get("value", 0)) for o in options),
                    default=0
                )
                total += float(max_points)
        return total


# Singleton
scale_engine = ScaleEngine()
```

---

## STEP 8 — BACKEND: scripts/seed_scales.py

Create backend/scripts/seed_scales.py — reads all JSON files from the original
prototype and seeds the prs_scales, prs_questions, and prs_conditions tables.

```python
#!/usr/bin/env python3
"""
Seed PRS scales and conditions from JSON files into Supabase.
Usage: python scripts/seed_scales.py --scales-dir PATH --conditions-file PATH
"""
import argparse
import json
import os
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from app.database import get_supabase_admin


def seed_scales(scales_dir: str, conditions_file: str):
    admin = get_supabase_admin()
    scales_path = Path(scales_dir)
    total_scales = 0
    total_questions = 0

    for json_file in sorted(scales_path.glob("*.json")):
        with open(json_file, "r") as f:
            scale = json.load(f)

        scale_id_str = scale.get("id") or json_file.stem
        print(f"  Seeding scale: {scale_id_str}...", end="")

        # Prepare scale row
        scale_row = {
            "scale_id": scale_id_str,
            "name": scale.get("name", scale_id_str),
            "short_name": scale.get("shortName", scale_id_str),
            "description": scale.get("description"),
            "version": str(scale.get("version", "1.0")),
            "recall_period": scale.get("recallPeriod"),
            "instructions": scale.get("instructions"),
            "scoring_type": scale.get("scoringType") or scale.get("scoringMethod") or "sum",
            "max_score": scale.get("maxScore"),
            "max_item_score": scale.get("maxItemScore"),
            "scored_questions": json.dumps(scale.get("scoredQuestions")) if scale.get("scoredQuestions") else "[]",
            "subscales": json.dumps(scale.get("subscales", [])),
            "domains": json.dumps(scale.get("domains", {})),
            "components": json.dumps(scale.get("components", [])),
            "severity_bands": json.dumps(scale.get("severityBands", [])),
            "risk_rules": json.dumps(scale.get("riskRules", [])),
            "interpretation": json.dumps(scale.get("interpretation", {})),
            "is_active": True,
        }

        # Upsert scale
        result = admin.table("prs_scales").upsert(
            scale_row, on_conflict="scale_id"
        ).execute()

        if not result.data:
            print(f" ERROR: failed to upsert scale {scale_id_str}")
            continue

        scale_db_id = result.data[0]["id"]

        # Seed questions
        questions = scale.get("questions", [])
        question_rows = []
        for q in questions:
            idx = q.get("index", questions.index(q))
            q_row = {
                "scale_id": scale_db_id,
                "question_index": idx,
                "label": q.get("label"),
                "question_text": q.get("question") or q.get("text") or q.get("label") or f"Question {idx+1}",
                "question_type": q.get("type", "likert"),
                "is_required": q.get("required", True),
                "scored_in_total": q.get("scoredInTotal", True),
                "include_in_score": q.get("includeInScore", True),
                "supplementary": q.get("supplementary", False),
                "conditional_on": json.dumps(q.get("conditionalOn")) if q.get("conditionalOn") else None,
                "options": json.dumps(q.get("options", [])),
                "validation": json.dumps(q.get("validation", {})),
                "dimension": q.get("dimension"),
            }
            question_rows.append(q_row)

        if question_rows:
            admin.table("prs_questions").upsert(
                question_rows, on_conflict="scale_id,question_index"
            ).execute()

        total_scales += 1
        total_questions += len(question_rows)
        print(f" ✓ ({len(question_rows)} questions)")

    # Seed conditions
    print(f"\n  Seeding conditions from {conditions_file}...")
    with open(conditions_file, "r") as f:
        condition_map = json.load(f)

    total_conditions = 0
    for cond_id, cond_data in condition_map.get("conditions", {}).items():
        cond_row = {
            "condition_id": cond_id,
            "label": cond_data.get("label", cond_id),
            "description": cond_data.get("description"),
            "scale_ids": cond_data.get("scales", []),
            "is_active": True,
        }
        admin.table("prs_conditions").upsert(
            cond_row, on_conflict="condition_id"
        ).execute()
        total_conditions += 1
        print(f"    ✓ {cond_id}: {len(cond_data.get('scales', []))} scales")

    print(f"\n✅ Seeding complete:")
    print(f"   Scales:     {total_scales}")
    print(f"   Questions:  {total_questions}")
    print(f"   Conditions: {total_conditions}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed PRS scales into Supabase")
    parser.add_argument("--scales-dir", required=True, help="Path to scales/ directory")
    parser.add_argument("--conditions-file", required=True, help="Path to conditionMap.json")
    args = parser.parse_args()
    print("🌱 NeuroWellness Scale Seeder Starting...\n")
    seed_scales(args.scales_dir, args.conditions_file)
```

---

## STEP 9 — BACKEND: All Routers

### backend/app/routers/auth.py
Handles profile sync after Supabase registration.

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response

router = APIRouter()


class RegistrationSyncRequest(BaseModel):
    full_name: str
    email: EmailStr
    role: str  # 'doctor' or 'patient'
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: str = "India"
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    # Doctor fields
    specialization: Optional[str] = None
    license_number: Optional[str] = None
    hospital_affiliation: Optional[str] = None
    years_of_experience: Optional[int] = None
    # Patient fields
    medical_history: Optional[str] = None
    emergency_contact: Optional[str] = None


@router.post("/sync-profile")
async def sync_profile(
    body: RegistrationSyncRequest,
    current_user: dict = Depends(get_current_user),
):
    """Called from frontend after Supabase auth.signUp completes."""
    admin = get_supabase_admin()
    user_id = current_user["id"]

    if body.role not in ["doctor", "patient"]:
        raise HTTPException(status_code=400, detail="Role must be 'doctor' or 'patient'")

    # Insert profile
    profile_data = {
        "id": user_id,
        "role": body.role,
        "full_name": body.full_name,
        "email": body.email,
        "phone": body.phone,
        "city": body.city,
        "state": body.state,
        "country": body.country,
        "date_of_birth": body.date_of_birth,
        "gender": body.gender,
        "is_active": True,
    }
    admin.table("profiles").upsert(profile_data).execute()

    # Role-specific tables
    if body.role == "doctor":
        doctor_data = {
            "id": user_id,
            "specialization": body.specialization,
            "license_number": body.license_number,
            "hospital_affiliation": body.hospital_affiliation,
            "years_of_experience": body.years_of_experience,
            "availability": "available",
            "current_patient_count": 0,
            "max_patients": 50,
        }
        admin.table("doctors").upsert(doctor_data).execute()

    elif body.role == "patient":
        patient_data = {
            "id": user_id,
            "medical_history": body.medical_history,
            "emergency_contact": body.emergency_contact,
        }
        admin.table("patients").upsert(patient_data).execute()
        # Auto-allocate doctor
        if body.city:
            admin.rpc("allocate_doctor_to_patient", {
                "p_patient_id": user_id,
                "p_city": body.city,
            }).execute()

    return success_response({"role": body.role, "id": user_id}, "Profile synced successfully")


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Returns full profile for current user."""
    admin = get_supabase_admin()
    user_id = current_user["id"]

    profile = admin.table("profiles").select("*").eq("id", user_id).single().execute().data
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if profile["role"] == "doctor":
        extra = admin.table("doctors").select("*").eq("id", user_id).single().execute().data or {}
    else:
        extra = admin.table("patients").select("*").eq("id", user_id).single().execute().data or {}

    return success_response({**profile, **extra})
```

### backend/app/routers/prs/scales.py

```python
from fastapi import APIRouter, Depends, Query
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response, paginated_response

router = APIRouter()


@router.get("/")
async def list_scales(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    admin = get_supabase_admin()
    result = admin.table("prs_scales").select(
        "id, scale_id, name, short_name, description, scoring_type, max_score, severity_bands, is_active"
    ).eq("is_active", True).range(skip, skip + limit - 1).execute()
    total = len(result.data)
    return paginated_response(result.data, total, skip, limit)


@router.get("/by-code/{code}")
async def get_scale_by_code(code: str, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    scale = admin.table("prs_scales").select("*").eq("scale_id", code).single().execute().data
    if not scale:
        from app.utils.exceptions import NotFoundError
        raise NotFoundError(f"Scale '{code}' not found")
    questions = admin.table("prs_questions").select("*").eq("scale_id", scale["id"]).order("question_index").execute().data
    return success_response({**scale, "questions": questions})


@router.get("/{scale_id}")
async def get_scale(scale_id: str, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    scale = admin.table("prs_scales").select("*").eq("id", scale_id).single().execute().data
    if not scale:
        from app.utils.exceptions import NotFoundError
        raise NotFoundError("Scale not found")
    questions = admin.table("prs_questions").select("*").eq("scale_id", scale_id).order("question_index").execute().data
    return success_response({**scale, "questions": questions})
```

### backend/app/routers/prs/conditions.py

```python
from fastapi import APIRouter, Depends
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response

router = APIRouter()


@router.get("/")
async def list_conditions(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    conditions = admin.table("prs_conditions").select("*").eq("is_active", True).execute().data
    return success_response(conditions)


@router.get("/{condition_id}")
async def get_condition(condition_id: str, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    condition = admin.table("prs_conditions").select("*").eq("condition_id", condition_id).single().execute().data
    if not condition:
        from app.utils.exceptions import NotFoundError
        raise NotFoundError("Condition not found")
    # Fetch scales for this condition
    scales = []
    for scale_code in condition.get("scale_ids", []):
        s = admin.table("prs_scales").select("id, scale_id, name, short_name, description, max_score").eq("scale_id", scale_code).eq("is_active", True).execute().data
        if s:
            scales.append(s[0])
    return success_response({**condition, "scales": scales})
```

### backend/app/routers/prs/permissions.py

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.dependencies import get_current_user, require_doctor
from app.database import get_supabase_admin
from app.utils.responses import success_response
from app.utils.exceptions import ForbiddenError, NotFoundError

router = APIRouter()


class GrantPermissionRequest(BaseModel):
    patient_id: str
    scale_id: str
    session_id: Optional[str] = None
    notes: Optional[str] = None


@router.post("/")
async def grant_permission(
    body: GrantPermissionRequest,
    current_user: dict = Depends(require_doctor),
):
    admin = get_supabase_admin()
    # Verify doctor-patient relationship
    patient = admin.table("patients").select("assigned_doctor_id").eq("id", body.patient_id).single().execute().data
    if not patient or patient["assigned_doctor_id"] != current_user["id"]:
        raise ForbiddenError("Patient is not assigned to you")

    perm = {
        "patient_id": body.patient_id,
        "doctor_id": current_user["id"],
        "scale_id": body.scale_id,
        "session_id": body.session_id,
        "status": "granted",
        "notes": body.notes,
    }
    result = admin.table("assessment_permissions").upsert(perm, on_conflict="patient_id,scale_id,session_id").execute()

    # Notify patient
    scale = admin.table("prs_scales").select("name").eq("id", body.scale_id).single().execute().data
    admin.table("notifications").insert({
        "user_id": body.patient_id,
        "type": "permission_granted",
        "title": "New Assessment Available",
        "body": f"Dr. {current_user['full_name']} has assigned you the {scale['name'] if scale else 'assessment'}.",
        "data": {"scale_id": body.scale_id, "permission_id": result.data[0]["id"]},
    }).execute()

    return success_response(result.data[0], "Permission granted")


@router.get("/patient/{patient_id}")
async def get_patient_permissions(patient_id: str, current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    perms = admin.table("assessment_permissions").select(
        "*, prs_scales(id, scale_id, name, short_name)"
    ).eq("patient_id", patient_id).eq("doctor_id", current_user["id"]).order("granted_at", desc=True).execute().data
    return success_response(perms)


@router.get("/my")
async def get_my_permissions(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    perms = admin.table("assessment_permissions").select(
        "*, prs_scales(id, scale_id, name, short_name, description)"
    ).eq("patient_id", current_user["id"]).eq("status", "granted").execute().data
    return success_response(perms)


@router.put("/{permission_id}/revoke")
async def revoke_permission(permission_id: str, current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    from datetime import datetime
    result = admin.table("assessment_permissions").update({
        "status": "revoked", "revoked_at": datetime.utcnow().isoformat()
    }).eq("id", permission_id).eq("doctor_id", current_user["id"]).execute()
    return success_response(result.data[0] if result.data else {}, "Permission revoked")
```

### backend/app/routers/prs/assessment.py

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.services.scale_engine import scale_engine
from app.utils.responses import success_response
from app.utils.exceptions import ForbiddenError, NotFoundError, BadRequestError

router = APIRouter()


class StartAssessmentRequest(BaseModel):
    scale_id: str              # UUID of prs_scales row
    session_id: Optional[str] = None
    taken_by: str = "patient"  # 'patient' or 'doctor_on_behalf'
    patient_id: Optional[str] = None  # required when taken_by='doctor_on_behalf'


class ResponseItem(BaseModel):
    question_index: int
    response_value: str
    response_label: Optional[str] = None


class SubmitAssessmentRequest(BaseModel):
    assessment_session_id: str
    responses: List[ResponseItem]


@router.post("/start")
async def start_assessment(body: StartAssessmentRequest, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    role = current_user["role"]

    if body.taken_by == "patient" and role == "patient":
        patient_id = current_user["id"]
        # Verify permission exists
        perm = admin.table("assessment_permissions").select("id, doctor_id").eq(
            "patient_id", patient_id
        ).eq("scale_id", body.scale_id).eq("status", "granted").execute().data
        if not perm:
            raise ForbiddenError("You don't have permission to take this assessment")
        doctor_id = perm[0]["doctor_id"]

    elif body.taken_by == "doctor_on_behalf" and role in ["doctor", "admin"]:
        if not body.patient_id:
            raise BadRequestError("patient_id is required for doctor_on_behalf")
        patient_id = body.patient_id
        # Verify doctor-patient relationship
        patient = admin.table("patients").select("assigned_doctor_id").eq("id", patient_id).single().execute().data
        if not patient or patient["assigned_doctor_id"] != current_user["id"]:
            raise ForbiddenError("Patient is not assigned to you")
        doctor_id = current_user["id"]
    else:
        raise ForbiddenError("Invalid role or taken_by combination")

    # Fetch scale with questions
    scale = admin.table("prs_scales").select("*").eq("id", body.scale_id).single().execute().data
    if not scale:
        raise NotFoundError("Scale not found")
    questions = admin.table("prs_questions").select("*").eq("scale_id", body.scale_id).order("question_index").execute().data

    # Create assessment session
    session_row = {
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "scale_id": body.scale_id,
        "session_id": body.session_id,
        "taken_by": body.taken_by,
        "status": "in_progress",
    }
    session_result = admin.table("assessment_sessions").insert(session_row).execute()
    assessment_session_id = session_result.data[0]["id"]

    return success_response({
        "assessment_session_id": assessment_session_id,
        "scale": {**scale, "questions": questions},
    })


@router.post("/submit")
async def submit_assessment(body: SubmitAssessmentRequest, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()

    # Fetch session
    session = admin.table("assessment_sessions").select("*").eq(
        "id", body.assessment_session_id
    ).single().execute().data
    if not session:
        raise NotFoundError("Assessment session not found")
    if session["status"] != "in_progress":
        raise BadRequestError("Assessment already submitted")

    # Auth check
    user_id = current_user["id"]
    if session["patient_id"] != user_id and session["doctor_id"] != user_id:
        raise ForbiddenError("Not your assessment session")

    # Fetch scale config + questions
    scale = admin.table("prs_scales").select("*").eq("id", session["scale_id"]).single().execute().data
    questions = admin.table("prs_questions").select("*").eq("scale_id", session["scale_id"]).order("question_index").execute().data

    # Build responses dict for engine {index: value}
    responses_dict = {r.question_index: r.response_value for r in body.responses}

    # Prepare scale config as engine expects
    scale_config = {
        **scale,
        "scoringType": scale["scoring_type"],
        "maxScore": scale.get("max_score"),
        "maxItemScore": scale.get("max_item_score"),
        "scoredQuestions": scale.get("scored_questions") or [],
        "subscales": scale.get("subscales") or [],
        "domains": scale.get("domains") or {},
        "components": scale.get("components") or [],
        "severityBands": scale.get("severity_bands") or [],
        "riskRules": scale.get("risk_rules") or [],
        "questions": [
            {
                "index": q["question_index"],
                "type": q["question_type"],
                "scoredInTotal": q["scored_in_total"],
                "includeInScore": q["include_in_score"],
                "supplementary": q["supplementary"],
                "options": q.get("options") or [],
                "dimension": q.get("dimension"),
                "conditionalOn": q.get("conditional_on"),
            }
            for q in questions
        ],
    }

    # Calculate score
    score_result = scale_engine.calculate_score(scale_config, responses_dict)
    severity = scale_engine.get_severity(scale_config, score_result.total)
    risk_flags = scale_engine.detect_risk_flags(scale_config, responses_dict, score_result)

    # Save responses
    q_map = {q["question_index"]: q["id"] for q in questions}
    response_rows = [
        {
            "assessment_session_id": body.assessment_session_id,
            "question_id": q_map.get(r.question_index),
            "question_index": r.question_index,
            "response_value": r.response_value,
            "response_label": r.response_label,
        }
        for r in body.responses if q_map.get(r.question_index)
    ]
    if response_rows:
        admin.table("assessment_responses").upsert(
            response_rows, on_conflict="assessment_session_id,question_index"
        ).execute()

    # Save score
    score_row = {
        "assessment_session_id": body.assessment_session_id,
        "patient_id": session["patient_id"],
        "scale_id": session["scale_id"],
        "total_score": score_result.total,
        "max_possible": score_result.max_possible,
        "severity_level": severity.level if severity else None,
        "severity_label": severity.label if severity else None,
        "subscale_scores": score_result.subscale_scores or {},
        "domain_scores": score_result.domain_scores or {},
        "component_scores": score_result.component_scores or {},
        "question_scores": score_result.question_scores or {},
        "risk_flags": [rf.__dict__ for rf in risk_flags],
        "raw_score_data": score_result.extra or {},
    }
    score_db = admin.table("assessment_scores").insert(score_row).execute().data[0]

    # Update session status
    admin.table("assessment_sessions").update({
        "status": "completed",
        "completed_at": datetime.utcnow().isoformat(),
    }).eq("id", body.assessment_session_id).execute()

    # Mark permission completed
    admin.table("assessment_permissions").update({"status": "completed"}).eq(
        "patient_id", session["patient_id"]
    ).eq("scale_id", session["scale_id"]).eq("status", "granted").execute()

    # Notify doctor
    admin.table("notifications").insert({
        "user_id": session["doctor_id"],
        "type": "assessment_completed",
        "title": "Assessment Completed",
        "body": f"A patient completed {scale['name']}. Score: {score_result.total}/{score_result.max_possible}",
        "data": {"assessment_session_id": body.assessment_session_id, "score_id": score_db["id"]},
    }).execute()

    return success_response(score_db, "Assessment submitted successfully")
```

### backend/app/routers/prs/scores.py

```python
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.dependencies import get_current_user, require_doctor
from app.database import get_supabase_admin
from app.utils.responses import success_response, paginated_response
from app.utils.exceptions import ForbiddenError

router = APIRouter()


@router.get("/me")
async def my_scores(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    scale_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    admin = get_supabase_admin()
    query = admin.table("assessment_scores").select(
        "id, total_score, max_possible, percentage, severity_level, severity_label, "
        "subscale_scores, domain_scores, risk_flags, calculated_at, "
        "prs_scales(id, scale_id, name, short_name)"
    ).eq("patient_id", current_user["id"])
    if scale_id:
        query = query.eq("scale_id", scale_id)
    result = query.order("calculated_at", desc=True).range(skip, skip + limit - 1).execute()
    return paginated_response(result.data, len(result.data), skip, limit)


@router.get("/me/summary")
async def my_score_summary(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    scores = admin.table("assessment_scores").select(
        "total_score, max_possible, percentage, severity_level, severity_label, calculated_at, "
        "prs_scales(scale_id, name, short_name)"
    ).eq("patient_id", current_user["id"]).order("calculated_at", desc=True).execute().data

    # Latest per scale
    seen = {}
    for score in scores:
        scale_code = (score.get("prs_scales") or {}).get("scale_id", "")
        if scale_code not in seen:
            seen[scale_code] = score

    return success_response(list(seen.values()))


@router.get("/patient/{patient_id}/summary")
async def patient_score_summary(patient_id: str, current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    # Verify doctor-patient relationship
    patient = admin.table("patients").select("assigned_doctor_id").eq("id", patient_id).single().execute().data
    if not patient or patient["assigned_doctor_id"] != current_user["id"]:
        raise ForbiddenError("Patient not assigned to you")

    scores = admin.table("assessment_scores").select(
        "id, total_score, max_possible, percentage, severity_level, severity_label, "
        "subscale_scores, domain_scores, risk_flags, calculated_at, "
        "prs_scales(scale_id, name, short_name)"
    ).eq("patient_id", patient_id).order("calculated_at", desc=True).execute().data

    # Latest per scale
    seen = {}
    for score in scores:
        scale_code = (score.get("prs_scales") or {}).get("scale_id", "")
        if scale_code not in seen:
            seen[scale_code] = score

    return success_response(list(seen.values()))


@router.get("/patient/{patient_id}")
async def patient_scores_with_responses(
    patient_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_doctor),
):
    admin = get_supabase_admin()
    patient = admin.table("patients").select("assigned_doctor_id").eq("id", patient_id).single().execute().data
    if not patient or patient["assigned_doctor_id"] != current_user["id"]:
        raise ForbiddenError("Patient not assigned to you")

    scores = admin.table("assessment_scores").select(
        "*, prs_scales(scale_id, name, short_name), "
        "assessment_sessions(id, taken_by, started_at, completed_at)"
    ).eq("patient_id", patient_id).order("calculated_at", desc=True).range(skip, skip + limit - 1).execute().data

    # Attach responses for doctor view
    for score in scores:
        session_id = (score.get("assessment_sessions") or {}).get("id")
        if session_id:
            responses = admin.table("assessment_responses").select(
                "question_index, response_value, response_label"
            ).eq("assessment_session_id", session_id).order("question_index").execute().data
            score["responses"] = responses

    return paginated_response(scores, len(scores), skip, limit)
```

### backend/app/routers/doctors.py

```python
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.dependencies import require_doctor
from app.database import get_supabase_admin
from app.utils.responses import success_response, paginated_response
from app.utils.exceptions import ForbiddenError
from pydantic import BaseModel

router = APIRouter()


@router.get("/dashboard")
async def doctor_dashboard(current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    doctor_id = current_user["id"]

    # Doctor profile + doctor fields
    profile = admin.table("profiles").select("*").eq("id", doctor_id).single().execute().data
    doctor = admin.table("doctors").select("*").eq("id", doctor_id).single().execute().data

    # Patient count
    patients = admin.table("patients").select("id").eq("assigned_doctor_id", doctor_id).execute().data
    total_patients = len(patients)
    patient_ids = [p["id"] for p in patients]

    # Pending permissions
    pending = 0
    if patient_ids:
        perm_res = admin.table("assessment_permissions").select("id").in_(
            "patient_id", patient_ids
        ).eq("status", "granted").execute()
        pending = len(perm_res.data)

    # Recent completed assessments (last 5)
    recent = []
    if patient_ids:
        recent_res = admin.table("assessment_scores").select(
            "total_score, severity_label, calculated_at, "
            "prs_scales(name, short_name), "
            "patients(profiles(full_name))"
        ).in_("patient_id", patient_ids).order("calculated_at", desc=True).limit(5).execute()
        recent = recent_res.data

    return success_response({
        "profile": {**(profile or {}), **(doctor or {})},
        "patients_summary": {
            "total": total_patients,
            "pending_assessments": pending,
        },
        "recent_completed_assessments": recent,
    })


@router.get("/patients")
async def list_patients(
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_doctor),
):
    admin = get_supabase_admin()
    query = admin.table("patients").select(
        "id, assigned_doctor_id, medical_history, created_at, "
        "profiles(id, full_name, email, phone, city, state, created_at)"
    ).eq("assigned_doctor_id", current_user["id"])
    result = query.range(skip, skip + limit - 1).execute()
    data = result.data

    if search:
        search_lower = search.lower()
        data = [p for p in data if search_lower in (p.get("profiles") or {}).get("full_name", "").lower()]

    return paginated_response(data, len(data), skip, limit)


@router.get("/patients/{patient_id}")
async def get_patient_detail(patient_id: str, current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    patient = admin.table("patients").select("*").eq("id", patient_id).single().execute().data
    if not patient or patient["assigned_doctor_id"] != current_user["id"]:
        raise ForbiddenError("Patient not assigned to you")

    profile = admin.table("profiles").select("*").eq("id", patient_id).single().execute().data
    permissions = admin.table("assessment_permissions").select(
        "*, prs_scales(scale_id, name, short_name)"
    ).eq("patient_id", patient_id).order("granted_at", desc=True).execute().data
    scores_summary = admin.table("assessment_scores").select(
        "total_score, max_possible, percentage, severity_level, severity_label, calculated_at, prs_scales(scale_id, name, short_name)"
    ).eq("patient_id", patient_id).order("calculated_at", desc=True).limit(10).execute().data
    sessions = admin.table("sessions").select("*").eq("patient_id", patient_id).eq("doctor_id", current_user["id"]).order("scheduled_at", desc=True).limit(5).execute().data

    return success_response({
        "patient": {**patient, **profile},
        "permissions": permissions,
        "scores_summary": scores_summary,
        "sessions": sessions,
    })


class GrantAssessmentRequest(BaseModel):
    scale_id: str
    session_id: Optional[str] = None
    notes: Optional[str] = None

from typing import Optional

@router.post("/patients/{patient_id}/grant-assessment")
async def grant_assessment(
    patient_id: str,
    body: GrantAssessmentRequest,
    current_user: dict = Depends(require_doctor),
):
    admin = get_supabase_admin()
    patient = admin.table("patients").select("assigned_doctor_id").eq("id", patient_id).single().execute().data
    if not patient or patient["assigned_doctor_id"] != current_user["id"]:
        raise ForbiddenError("Patient not assigned to you")

    perm = {
        "patient_id": patient_id,
        "doctor_id": current_user["id"],
        "scale_id": body.scale_id,
        "session_id": body.session_id,
        "status": "granted",
        "notes": body.notes,
    }
    result = admin.table("assessment_permissions").upsert(perm, on_conflict="patient_id,scale_id,session_id").execute()
    scale = admin.table("prs_scales").select("name").eq("id", body.scale_id).single().execute().data
    admin.table("notifications").insert({
        "user_id": patient_id,
        "type": "permission_granted",
        "title": "New Assessment Assigned",
        "body": f"Dr. {current_user['full_name']} assigned you {scale['name'] if scale else 'an assessment'}.",
        "data": {"scale_id": body.scale_id},
    }).execute()
    return success_response(result.data[0] if result.data else {}, "Assessment granted")


class AvailabilityUpdate(BaseModel):
    availability: str  # 'available' | 'limited' | 'unavailable'


@router.put("/availability")
async def update_availability(body: AvailabilityUpdate, current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    result = admin.table("doctors").update({"availability": body.availability}).eq("id", current_user["id"]).execute()
    return success_response(result.data[0] if result.data else {}, "Availability updated")
```

### backend/app/routers/patients.py

```python
from fastapi import APIRouter, Depends
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response
from app.utils.exceptions import NotFoundError

router = APIRouter()


@router.get("/dashboard")
async def patient_dashboard(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    patient_id = current_user["id"]

    profile = admin.table("profiles").select("*").eq("id", patient_id).single().execute().data
    patient = admin.table("patients").select("*").eq("id", patient_id).single().execute().data

    # Assigned doctor
    doctor_info = None
    if patient and patient.get("assigned_doctor_id"):
        dr_profile = admin.table("profiles").select("full_name, email, phone, city").eq("id", patient["assigned_doctor_id"]).single().execute().data
        dr_extra = admin.table("doctors").select("specialization, availability").eq("id", patient["assigned_doctor_id"]).single().execute().data
        doctor_info = {**(dr_profile or {}), **(dr_extra or {})}

    # Pending assessments
    pending = admin.table("assessment_permissions").select(
        "*, prs_scales(scale_id, name, short_name, description)"
    ).eq("patient_id", patient_id).eq("status", "granted").execute().data

    # Recent scores
    recent_scores = admin.table("assessment_scores").select(
        "total_score, max_possible, percentage, severity_level, severity_label, calculated_at, prs_scales(name, short_name)"
    ).eq("patient_id", patient_id).order("calculated_at", desc=True).limit(3).execute().data

    # Upcoming sessions
    sessions = admin.table("sessions").select("*").eq("patient_id", patient_id).eq("status", "scheduled").order("scheduled_at").limit(2).execute().data

    return success_response({
        "profile": {**(profile or {}), **(patient or {})},
        "assigned_doctor": doctor_info,
        "pending_assessments": pending,
        "recent_scores": recent_scores,
        "upcoming_sessions": sessions,
    })


@router.get("/my-doctor")
async def my_doctor(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    patient = admin.table("patients").select("assigned_doctor_id").eq("id", current_user["id"]).single().execute().data
    if not patient or not patient.get("assigned_doctor_id"):
        return success_response(None, "No doctor assigned yet")
    dr_id = patient["assigned_doctor_id"]
    profile = admin.table("profiles").select("full_name, email, phone, city").eq("id", dr_id).single().execute().data
    extra = admin.table("doctors").select("specialization, hospital_affiliation, availability, bio").eq("id", dr_id).single().execute().data
    return success_response({**(profile or {}), **(extra or {})})


@router.get("/my-assessments")
async def my_assessments(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    perms = admin.table("assessment_permissions").select(
        "*, prs_scales(scale_id, name, short_name, description)"
    ).eq("patient_id", current_user["id"]).order("granted_at", desc=True).execute().data
    return success_response(perms)


@router.get("/my-scores")
async def my_scores(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    scores = admin.table("assessment_scores").select(
        "id, total_score, max_possible, percentage, severity_level, severity_label, "
        "calculated_at, prs_scales(scale_id, name, short_name)"
    ).eq("patient_id", current_user["id"]).order("calculated_at", desc=True).execute().data
    return success_response(scores)
```

### backend/app/routers/notifications.py

```python
from fastapi import APIRouter, Depends
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response

router = APIRouter()


@router.get("/")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    result = admin.table("notifications").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).limit(20).execute()
    return success_response(result.data)


@router.put("/{notification_id}/read")
async def mark_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    result = admin.table("notifications").update({"is_read": True}).eq("id", notification_id).eq("user_id", current_user["id"]).execute()
    return success_response(result.data[0] if result.data else {})


@router.put("/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    admin.table("notifications").update({"is_read": True}).eq("user_id", current_user["id"]).eq("is_read", False).execute()
    return success_response({}, "All notifications marked as read")
```

---

## STEP 10 — BACKEND: main.py (wire everything together)

```python
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import get_settings
from app.routers import auth, doctors, patients, notifications
from app.routers.prs import scales, conditions, permissions, assessment, scores

settings = get_settings()

app = FastAPI(
    title="NeuroWellness API",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=600,
)

PREFIX = settings.API_PREFIX

app.include_router(auth.router, prefix=f"{PREFIX}/auth", tags=["auth"])
app.include_router(doctors.router, prefix=f"{PREFIX}/doctors", tags=["doctors"])
app.include_router(patients.router, prefix=f"{PREFIX}/patients", tags=["patients"])
app.include_router(notifications.router, prefix=f"{PREFIX}/notifications", tags=["notifications"])
app.include_router(scales.router, prefix=f"{PREFIX}/prs/scales", tags=["prs-scales"])
app.include_router(conditions.router, prefix=f"{PREFIX}/prs/conditions", tags=["prs-conditions"])
app.include_router(permissions.router, prefix=f"{PREFIX}/prs/permissions", tags=["prs-permissions"])
app.include_router(assessment.router, prefix=f"{PREFIX}/prs/assessment", tags=["prs-assessment"])
app.include_router(scores.router, prefix=f"{PREFIX}/prs/scores", tags=["prs-scores"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "environment": settings.ENVIRONMENT}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "Internal server error", "detail": str(exc)},
    )
```

---

## STEP 11 — BACKEND: Dockerfile and Makefile

backend/Dockerfile:
```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY app/ ./app/
COPY scripts/ ./scripts/
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD curl -f http://localhost:8000/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

backend/Makefile:
```makefile
dev:
	uvicorn app.main:app --reload --port 8000

seed:
	python scripts/seed_scales.py \
		--scales-dir ../prs-main/data/scales \
		--conditions-file ../prs-main/data/conditionMap.json

test:
	pytest tests/ -v

lint:
	ruff check app/

install:
	pip install -r requirements.txt
```

backend/.env.example:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
JWT_SECRET=your-supabase-jwt-secret
ENVIRONMENT=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
API_PREFIX=/api/v1
```

---

## STEP 12 — FRONTEND SETUP

Run: `npm create vite@latest frontend -- --template react`
Then: `cd frontend && npm install axios zustand react-router-dom @supabase/supabase-js`

frontend/.env.example:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:8000/api/v1
```

frontend/src/lib/supabase.js:
```js
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

frontend/src/lib/api.js:
```js
import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL })

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await supabase.auth.signOut()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
```

---

## STEP 13 — FRONTEND: Zustand Stores

frontend/src/store/authStore.js:
```js
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import api from '../lib/api'

export const useAuthStore = create((set) => ({
  user: null,
  profile: null,
  role: null,
  isLoading: true,
  isAuthenticated: false,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      try {
        const res = await api.get('/auth/me')
        const profile = res.data.data
        set({ user: session.user, profile, role: profile.role, isAuthenticated: true, isLoading: false })
      } catch {
        set({ isLoading: false })
      }
    } else {
      set({ isLoading: false })
    }
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        set({ user: null, profile: null, role: null, isAuthenticated: false })
      }
    })
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const res = await api.get('/auth/me')
    const profile = res.data.data
    set({ user: data.user, profile, role: profile.role, isAuthenticated: true })
    return profile
  },

  register: async (formData) => {
    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
    })
    if (error) throw error
    // Small delay for token to be available
    await new Promise(r => setTimeout(r, 500))
    await api.post('/auth/sync-profile', formData)
    return data
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, role: null, isAuthenticated: false })
  },
}))
```

frontend/src/store/prsStore.js:
```js
import { create } from 'zustand'
import api from '../lib/api'

export const usePrsStore = create((set, get) => ({
  scales: [],
  conditions: [],
  activeSession: null,       // {assessment_session_id, scale}
  currentQuestionIndex: 0,
  responses: {},             // {question_index: {value, label}}
  submittedScore: null,
  isLoading: false,

  fetchScales: async () => {
    const res = await api.get('/prs/scales?limit=100')
    set({ scales: res.data.data })
  },

  fetchConditions: async () => {
    const res = await api.get('/prs/conditions')
    set({ conditions: res.data.data })
  },

  startAssessment: async (scale_id, taken_by = 'patient', patient_id = null) => {
    set({ isLoading: true })
    const body = { scale_id, taken_by }
    if (patient_id) body.patient_id = patient_id
    const res = await api.post('/prs/assessment/start', body)
    const { assessment_session_id, scale } = res.data.data
    set({
      activeSession: { assessment_session_id, scale },
      currentQuestionIndex: 0,
      responses: {},
      submittedScore: null,
      isLoading: false,
    })
    return { assessment_session_id, scale }
  },

  setResponse: (question_index, value, label = null) => {
    set((state) => ({
      responses: { ...state.responses, [question_index]: { value: String(value), label } }
    }))
  },

  nextQuestion: () => set((state) => ({
    currentQuestionIndex: state.currentQuestionIndex + 1
  })),

  prevQuestion: () => set((state) => ({
    currentQuestionIndex: Math.max(0, state.currentQuestionIndex - 1)
  })),

  submitAssessment: async () => {
    const { activeSession, responses } = get()
    if (!activeSession) throw new Error('No active session')
    set({ isLoading: true })
    const responseList = Object.entries(responses).map(([idx, r]) => ({
      question_index: parseInt(idx),
      response_value: r.value,
      response_label: r.label,
    }))
    const res = await api.post('/prs/assessment/submit', {
      assessment_session_id: activeSession.assessment_session_id,
      responses: responseList,
    })
    set({ submittedScore: res.data.data, isLoading: false })
    return res.data.data
  },

  resetAssessment: () => set({
    activeSession: null, currentQuestionIndex: 0,
    responses: {}, submittedScore: null, isLoading: false,
  }),
}))
```

---

## STEP 14 — FRONTEND: All Pages and Components

Create ALL of the following files with WORKING code connected to the backend API.
Focus on functionality, not styling (simple clean HTML is fine).

### frontend/src/components/common/ProtectedRoute.jsx
Check isAuthenticated and role. Redirect to /login if not authenticated.
Redirect to correct dashboard if wrong role.

### frontend/src/components/layout/Navbar.jsx
Shows: App name "NeuroWellness", current user name, role badge, logout button.
Links: Doctor → /doctor/dashboard, /doctor/patients | Patient → /patient/dashboard, /patient/assessments, /patient/scores

### frontend/src/pages/auth/RegisterPage.jsx
Fields: Full Name, Email, Password, Confirm Password, Phone, City, State
Role selector: Doctor or Patient (radio buttons)
Doctor-only: Specialization, License Number
Patient-only: Medical History (optional)
On submit: useAuthStore.register(formData) → show success → redirect /login

### frontend/src/pages/auth/LoginPage.jsx
Fields: Email, Password
On submit: useAuthStore.login() → redirect to /doctor/dashboard or /patient/dashboard by role

### frontend/src/pages/doctor/DoctorDashboard.jsx
Fetch: GET /api/v1/doctors/dashboard
Show: Doctor name, stats (total patients, pending assessments), recent assessments table

### frontend/src/pages/doctor/PatientList.jsx
Fetch: GET /api/v1/doctors/patients
Search bar (client-side filter on name)
Table: Patient Name, City, Last Assessment, Actions (View Details → /doctor/patients/:id)

### frontend/src/pages/doctor/PatientDetail.jsx
Route: /doctor/patients/:patientId
Tabs: Overview | Assessments | Scores
Fetch on load: GET /api/v1/doctors/patients/:patientId

Overview tab: Patient info card

Assessments tab:
- Fetch scales: GET /api/v1/prs/scales?limit=100
- Scale selector dropdown + "Grant Assessment" button
- On grant: POST /api/v1/doctors/patients/:patientId/grant-assessment {scale_id}
- Table of granted permissions (scale, status, granted_at)
- "Take on Behalf" button per granted permission → starts assessment flow

Scores tab:
- Table of patient's scores: Scale, Score, Severity, Date
- Click to expand: shows subscale breakdowns and responses

### frontend/src/pages/patient/PatientDashboard.jsx
Fetch: GET /api/v1/patients/dashboard
Show:
- Assigned doctor card (name, specialization, availability)
- Pending assessments list with "Take Assessment" button
- Recent scores with severity color badges

### frontend/src/pages/patient/MyAssessments.jsx
Fetch: GET /api/v1/patients/my-assessments
Table: Scale Name, Status, Granted Date, Action (Take Assessment if granted)
"Take Assessment" → navigate to /assessment?scale_id=X

### frontend/src/pages/patient/MyScores.jsx
Fetch: GET /api/v1/patients/my-scores
Table: Scale, Score/Max, Severity, Date
Severity badges: minimal=green, mild=yellow, moderate=orange, severe=red

### frontend/src/pages/prs/AssessmentPage.jsx
On mount:
- Read ?scale_id= and ?patient_id= from URL params
- Call prsStore.startAssessment(scale_id, taken_by, patient_id)
- Show ScaleRunner component
- After submit: show ScoreCard with result

### frontend/src/components/prs/ScaleRunner.jsx
Props: questions (array), scaleId, onSubmit
Internal state: currentIndex, responses

Logic:
- Evaluate conditional questions (if conditionalOn defined, check if condition is met; if not, skip)
- Progress: "Question X of Y"
- Navigation: Back, Next, Submit (last question)
- Validate required fields before Next
- On Submit: call prsStore.submitAssessment() → navigate to result

### frontend/src/components/prs/QuestionRenderer.jsx
Props: question, value, onChange
Handle types:
- likert → vertical radio list with label and value
- single-choice → radio buttons
- numeric → number input (min/max from validation)
- text → textarea
- slider → range input (min/max/step from validation)
- visual-analogue-scale → range 0-100 with current value displayed

### frontend/src/components/prs/ScoreCard.jsx
Props: score, scaleName
Show: Total score (big), max possible, percentage, severity badge (color-coded), description
If subscale_scores → show breakdown table
If risk_flags → show warning list
Buttons: "Back to Dashboard", "Take Another Assessment"

### frontend/src/App.jsx
Routes:
/ → redirect based on role
/login → LoginPage
/register → RegisterPage
/doctor/dashboard → ProtectedRoute(doctor) → DoctorDashboard
/doctor/patients → ProtectedRoute(doctor) → PatientList
/doctor/patients/:patientId → ProtectedRoute(doctor) → PatientDetail
/patient/dashboard → ProtectedRoute(patient) → PatientDashboard
/patient/assessments → ProtectedRoute(patient) → MyAssessments
/patient/scores → ProtectedRoute(patient) → MyScores
/assessment → AssessmentPage (both roles, protected any auth)

Use Navbar on all authenticated pages.
Initialize authStore on app load.

---

## STEP 15 — DOCKER COMPOSE

docker-compose.yml (development):
```yaml
version: '3.9'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    env_file:
      - ./backend/.env
    command: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    env_file:
      - ./frontend/.env
    command: npm run dev -- --host
```

frontend/Dockerfile (production):
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

frontend/nginx.conf:
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location /api/ { proxy_pass http://backend:8000; proxy_set_header Host $host; }
    location ~* \.(js|css|png|jpg|ico|woff2)$ { expires 1y; add_header Cache-Control "public, immutable"; }
}
```

Root Makefile:
```makefile
dev:
	docker-compose up --build

stop:
	docker-compose down

seed:
	cd backend && python scripts/seed_scales.py --scales-dir ../prs-main/data/scales --conditions-file ../prs-main/data/conditionMap.json

backend-shell:
	docker-compose exec backend bash

logs:
	docker-compose logs -f

test:
	cd backend && pytest tests/ -v
```

---

## FINAL NOTES FOR CLAUDE CODE

1. Create ALL files listed above with complete, working code — no placeholder TODOs.
2. Every API call in the frontend must match the exact backend endpoint routes defined above.
3. The prsStore must properly track all question responses before submission.
4. ScaleRunner must handle conditional questions by checking conditionalOn logic client-side.
5. All protected routes must check authentication status AND role.
6. After seeding (make seed), all 47 scales and 16 conditions will be in the database.
7. The scale engine Python code handles all 20+ scoring types from the original JS prototype.
8. Doctor allocation happens automatically via the DB function when a patient registers.
9. Do not use any UI component library — plain HTML with inline styles or a simple CSS file is fine.
10. Ensure CORS is correctly configured so the frontend on port 5173 can reach backend on port 8000.
