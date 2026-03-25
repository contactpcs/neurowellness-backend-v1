from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import json

from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.services.scale_engine import scale_engine
from app.utils.responses import success_response
from app.utils.exceptions import ForbiddenError, NotFoundError, BadRequestError

router = APIRouter()


class StartAssessmentRequest(BaseModel):
    scale_id: str                        # UUID of prs_scales row
    taken_by: str = "patient"
    patient_id: Optional[str] = None    # required when taken_by == doctor_on_behalf


class ResponseItem(BaseModel):
    question_index: int
    response_value: str
    response_label: Optional[str] = None


class SubmitAssessmentRequest(BaseModel):
    assessment_session_id: str
    scale_id: str                        # which scale is being submitted
    responses: List[ResponseItem]


def _parse(val):
    """Parse JSONB fields that may come back as strings."""
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return val
    return val


@router.post("/start")
async def start_assessment(
    body: StartAssessmentRequest,
    current_user: dict = Depends(get_current_user),
):
    admin = get_supabase_admin()
    role = current_user["role"]

    # ── Resolve patient_id and doctor_id ──────────────────────────────────────
    if body.taken_by == "patient" and role == "patient":
        patient_id = current_user["id"]
        perm = admin.table("assessment_permissions").select("id, doctor_id, disease_id").eq(
            "patient_id", patient_id
        ).eq("scale_id", body.scale_id).eq("status", "granted").execute().data
        if not perm:
            raise ForbiddenError("No permission to take this assessment")
        doctor_id = perm[0]["doctor_id"]
        disease_id = perm[0].get("disease_id")

    elif body.taken_by == "doctor_on_behalf" and role in ["doctor", "admin"]:
        if not body.patient_id:
            raise BadRequestError("patient_id is required for doctor_on_behalf")
        patient_id = body.patient_id
        doctor_id = current_user["id"]
        # Try to find disease_id from any permission for this patient+scale
        perm = admin.table("assessment_permissions").select("disease_id").eq(
            "patient_id", patient_id
        ).eq("scale_id", body.scale_id).execute().data
        disease_id = perm[0].get("disease_id") if perm else None

    else:
        raise ForbiddenError("Invalid role or taken_by combination")

    # ── Resolve disease_id if not on permission ────────────────────────────────
    if not disease_id:
        link = admin.table("prs_disease_scales").select("disease_id").eq(
            "scale_id", body.scale_id
        ).limit(1).execute().data
        disease_id = link[0]["disease_id"] if link else None
    if not disease_id:
        raise BadRequestError("Cannot determine disease for this scale")

    # ── Load scale + questions + branching ────────────────────────────────────
    scale = admin.table("prs_scales").select("*").eq("id", body.scale_id).single().execute().data
    if not scale:
        raise NotFoundError("Scale not found")

    questions = admin.table("prs_questions").select("*").eq(
        "scale_id", body.scale_id
    ).order("question_index").execute().data

    branches = admin.table("prs_question_branches").select("*").eq(
        "scale_id", body.scale_id
    ).order("display_order").execute().data

    # ── Create assessment_session row ─────────────────────────────────────────
    session_row = {
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "disease_id": disease_id,
        "taken_by": body.taken_by,
        "status": "in_progress",
    }
    session_result = admin.table("assessment_sessions").insert(session_row).execute()
    assessment_session_id = session_result.data[0]["id"]

    return success_response({
        "assessment_session_id": assessment_session_id,
        "scale": {**scale, "questions": questions, "branches": branches},
    })


@router.post("/submit")
async def submit_assessment(
    body: SubmitAssessmentRequest,
    current_user: dict = Depends(get_current_user),
):
    admin = get_supabase_admin()

    # ── Validate session ──────────────────────────────────────────────────────
    session = admin.table("assessment_sessions").select("*").eq(
        "id", body.assessment_session_id
    ).single().execute().data
    if not session:
        raise NotFoundError("Assessment session not found")
    if session["status"] != "in_progress":
        raise BadRequestError("Assessment already submitted")

    user_id = current_user["id"]
    if session["patient_id"] != user_id and session["doctor_id"] != user_id:
        raise ForbiddenError("Not your assessment session")

    # ── Load scale + questions ────────────────────────────────────────────────
    scale = admin.table("prs_scales").select("*").eq("id", body.scale_id).single().execute().data
    if not scale:
        raise NotFoundError("Scale not found")

    questions = admin.table("prs_questions").select("*").eq(
        "scale_id", body.scale_id
    ).order("question_index").execute().data

    # ── Build scale_config for engine ─────────────────────────────────────────
    scoring_config = _parse(scale.get("scoring_config")) or {}

    scale_config = {
        "id": scale.get("scale_code"),
        "scoringMethod": scale.get("scoring_method", "sum"),
        "scoringType": scale.get("scoring_method", "sum"),
        "maxScore": scale.get("max_score"),
        "maxItemScore": scale.get("max_item_score"),
        "cutoffScore": scale.get("cutoff_score"),
        "cutoff": scale.get("cutoff_score"),
        "severityBands": _parse(scale.get("severity_bands")) or [],
        "riskRules": _parse(scale.get("risk_rules")) or [],
        # From scoring_config JSONB
        "subscales": scoring_config.get("subscales", []),
        "domains": scoring_config.get("domains", {}),
        "components": scoring_config.get("components", []),
        "scoredQuestions": scoring_config.get("scoredQuestions", []),
        "reverseItems": scoring_config.get("reverseItems", []),
        "partA": scoring_config.get("partA", []),
        "screeningThreshold": scoring_config.get("screeningThreshold", 4),
        "questions": [
            {
                "index": q["question_index"],
                "type": q["question_type"],
                "scoredInTotal": q["scored_in_total"],
                "includeInScore": q["include_in_score"],
                "supplementary": q["supplementary"],
                "dimension": q.get("domain_ref"),
                "options": _parse(q.get("options")) or [],
            }
            for q in questions
        ],
    }

    # ── Calculate score ───────────────────────────────────────────────────────
    responses_dict = {r.question_index: r.response_value for r in body.responses}
    score_result = scale_engine.calculate_score(scale_config, responses_dict)
    severity = scale_engine.get_severity(scale_config, score_result.total)
    risk_flags = scale_engine.detect_risk_flags(scale_config, responses_dict, score_result)

    # ── Save scale_scores ─────────────────────────────────────────────────────
    scale_score_row = {
        "assessment_session_id": body.assessment_session_id,
        "patient_id": session["patient_id"],
        "disease_id": session["disease_id"],
        "scale_id": body.scale_id,
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
    scale_score_db = admin.table("scale_scores").upsert(
        scale_score_row, on_conflict="assessment_session_id,scale_id"
    ).execute().data[0]
    scale_score_id = scale_score_db["id"]

    # ── Save assessment_responses ─────────────────────────────────────────────
    q_map = {q["question_index"]: q["id"] for q in questions}
    response_rows = [
        {
            "scale_score_id": scale_score_id,
            "question_id": q_map.get(r.question_index),
            "question_index": r.question_index,
            "response_value": r.response_value,
            "response_label": r.response_label,
        }
        for r in body.responses
        if q_map.get(r.question_index)
    ]
    if response_rows:
        admin.table("assessment_responses").upsert(
            response_rows, on_conflict="scale_score_id,question_index"
        ).execute()

    # ── Update assessment_session ─────────────────────────────────────────────
    admin.table("assessment_sessions").update({
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", body.assessment_session_id).execute()

    # ── Aggregate assessment_scores (overall session score) ───────────────────
    all_scale_scores = admin.table("scale_scores").select(
        "scale_id, total_score, max_possible, severity_level, severity_label, risk_flags"
    ).eq("assessment_session_id", body.assessment_session_id).execute().data or []

    total_agg = sum((s.get("total_score") or 0) for s in all_scale_scores)
    max_agg = sum((s.get("max_possible") or 0) for s in all_scale_scores)
    all_risk_flags = []
    for s in all_scale_scores:
        flags = _parse(s.get("risk_flags")) or []
        all_risk_flags.extend(flags if isinstance(flags, list) else [])

    # Worst severity
    sev_rank = ["minimal", "mild", "moderate", "severe", "moderately-severe"]
    overall_sev = None
    overall_sev_label = None
    for s in all_scale_scores:
        lv = s.get("severity_level")
        if lv:
            if overall_sev is None or (lv in sev_rank and sev_rank.index(lv) > sev_rank.index(overall_sev)):
                overall_sev = lv
                overall_sev_label = s.get("severity_label")

    scale_summaries = [
        {
            "scale_id": s["scale_id"],
            "total_score": s["total_score"],
            "max_possible": s["max_possible"],
            "severity_level": s["severity_level"],
            "severity_label": s["severity_label"],
        }
        for s in all_scale_scores
    ]

    admin.table("assessment_scores").upsert({
        "assessment_session_id": body.assessment_session_id,
        "patient_id": session["patient_id"],
        "disease_id": session["disease_id"],
        "total_score": total_agg,
        "max_possible": max_agg,
        "scales_completed": len(all_scale_scores),
        "overall_severity": overall_sev,
        "overall_severity_label": overall_sev_label,
        "scale_summaries": scale_summaries,
        "all_risk_flags": all_risk_flags,
    }, on_conflict="assessment_session_id").execute()

    # ── Mark permission completed ─────────────────────────────────────────────
    admin.table("assessment_permissions").update({"status": "completed"}).eq(
        "patient_id", session["patient_id"]
    ).eq("scale_id", body.scale_id).eq("status", "granted").execute()

    # ── Notify doctor ─────────────────────────────────────────────────────────
    admin.table("notifications").insert({
        "user_id": session["doctor_id"],
        "type": "assessment_completed",
        "title": "Assessment Completed",
        "body": f"Patient completed {scale['name']}. Score: {score_result.total}/{score_result.max_possible}",
        "data": {"assessment_session_id": body.assessment_session_id, "scale_score_id": scale_score_id},
    }).execute()

    return success_response(scale_score_db, "Assessment submitted successfully")
