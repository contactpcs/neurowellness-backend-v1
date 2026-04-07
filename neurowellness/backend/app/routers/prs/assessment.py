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
    scale_id: str                        # TEXT PK e.g. "EQ-5D-5L/2026"
    disease_id: Optional[str] = None     # TEXT PK e.g. "DEPRESSION/ANXIETY/2026"
    taken_by: str = "patient"
    patient_id: Optional[str] = None     # required when taken_by == doctor_on_behalf


class ResponseItem(BaseModel):
    question_index: int
    response_value: str
    response_label: Optional[str] = None


class SubmitAssessmentRequest(BaseModel):
    instance_id: str                     # TEXT PK e.g. "PAT001/001"
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
        disease_id = perm[0].get("disease_id") or body.disease_id

    elif body.taken_by == "doctor_on_behalf" and role in ["doctor", "clinical_assistant", "admin"]:
        if not body.patient_id:
            raise BadRequestError("patient_id is required for doctor_on_behalf")
        patient_id = body.patient_id
        doctor_id = current_user["id"]
        perm = admin.table("assessment_permissions").select("disease_id").eq(
            "patient_id", patient_id
        ).eq("scale_id", body.scale_id).execute().data
        disease_id = (perm[0].get("disease_id") if perm else None) or body.disease_id

    else:
        raise ForbiddenError("Invalid role or taken_by combination")

    # ── Resolve disease_id if not on permission ────────────────────────────────
    if not disease_id:
        link = admin.table("prs_disease_scale_map").select("disease_id").eq(
            "scale_id", body.scale_id
        ).limit(1).execute().data
        disease_id = link[0]["disease_id"] if link else None
    if not disease_id:
        raise BadRequestError("Cannot determine disease for this scale")

    # ── Generate instance_id ─────────────────────────────────────────────────
    # Count existing instances for this patient to determine sequence number
    existing = admin.table("prs_assessment_instances").select("instance_id").eq(
        "patient_id", patient_id
    ).execute().data
    seq = len(existing) + 1

    # Build patient code from patient count (PAT format)
    # For now use a hash-based short code since patient_id is UUID
    instance_id = f"PAT/{patient_id[:8]}/{seq:03d}"

    # ── Load scale + questions ───────────────────────────────────────────────
    scale = admin.table("prs_scales").select("*").eq("scale_id", body.scale_id).single().execute().data
    if not scale:
        raise NotFoundError("Scale not found")

    questions = admin.table("prs_questions").select("*").eq(
        "scale_id", body.scale_id
    ).order("display_order").execute().data

    # Load options + normalise shape for frontend
    for idx, q in enumerate(questions):
        opts = admin.table("prs_options").select("*").eq(
            "question_id", q["question_id"]
        ).order("display_order").execute().data
        # Normalise to frontend-expected shape: value, label, points
        q["options"] = [
            {
                "value":  o.get("option_value"),
                "label":  o.get("option_label"),
                "points": o.get("points", 0),
            }
            for o in opts
        ]
        # Add convenience fields the frontend uses
        q["question_index"] = idx
        q["question_type"]  = q.get("answer_type", "likert")

    # ── Create prs_assessment_instances row ──────────────────────────────────
    instance_row = {
        "instance_id": instance_id,
        "disease_id": disease_id,
        "patient_id": patient_id,
        "initiated_by": body.taken_by,
        "status": "in_progress",
    }
    admin.table("prs_assessment_instances").insert(instance_row).execute()

    return success_response({
        "instance_id": instance_id,
        "scale": {**scale, "questions": questions},
    })


@router.post("/submit")
async def submit_assessment(
    body: SubmitAssessmentRequest,
    current_user: dict = Depends(get_current_user),
):
    admin = get_supabase_admin()

    # ── Validate instance ────────────────────────────────────────────────────
    instance = admin.table("prs_assessment_instances").select("*").eq(
        "instance_id", body.instance_id
    ).single().execute().data
    if not instance:
        raise NotFoundError("Assessment instance not found")
    if instance["status"] != "in_progress":
        raise BadRequestError("Assessment already submitted")

    user_id = current_user["id"]
    if instance["patient_id"] != user_id:
        raise ForbiddenError("Not your assessment instance")

    # ── Load scale + questions ───────────────────────────────────────────────
    scale = admin.table("prs_scales").select("*").eq("scale_id", body.scale_id).single().execute().data
    if not scale:
        raise NotFoundError("Scale not found")

    questions = admin.table("prs_questions").select("*").eq(
        "scale_id", body.scale_id
    ).order("display_order").execute().data

    # Load options + normalise
    for idx, q in enumerate(questions):
        opts = admin.table("prs_options").select("*").eq(
            "question_id", q["question_id"]
        ).order("display_order").execute().data
        q["options"] = [
            {
                "value":  o.get("option_value"),
                "label":  o.get("option_label"),
                "points": o.get("points", 0),
            }
            for o in opts
        ]
        q["question_index"] = idx
        q["question_type"]  = q.get("answer_type", "likert")

    # ── Build scale_config for engine ────────────────────────────────────────
    scale_config = {
        "id": scale.get("scale_code"),
        "scoringMethod": "sum",
        "scoringType": "sum",
        "questions": [
            {
                "index": idx,
                "type": q.get("answer_type", "likert"),
                "options": q.get("options", []),
            }
            for idx, q in enumerate(questions)
        ],
    }

    # ── Calculate score ──────────────────────────────────────────────────────
    responses_dict = {r.question_index: r.response_value for r in body.responses}
    score_result = scale_engine.calculate_score(scale_config, responses_dict)
    severity = scale_engine.get_severity(scale_config, score_result.total)
    risk_flags = scale_engine.detect_risk_flags(scale_config, responses_dict, score_result)

    # ── Save prs_scale_results ───────────────────────────────────────────────
    scale_result_id = f"{body.instance_id}/{body.scale_id}"
    scale_result_row = {
        "scale_result_id": scale_result_id,
        "instance_id": body.instance_id,
        "scale_id": body.scale_id,
        "calculated_value": score_result.total,
        "max_possible": score_result.max_possible,
        "severity_level": severity.level if severity else None,
        "severity_label": severity.label if severity else None,
        "subscale_scores": score_result.subscale_scores or {},
        "risk_flags": [rf.__dict__ for rf in risk_flags],
        "raw_score_data": score_result.extra or {},
    }
    admin.table("prs_scale_results").upsert(
        scale_result_row, on_conflict="instance_id,scale_id"
    ).execute()

    # ── Save prs_responses ───────────────────────────────────────────────────
    q_list = questions
    response_rows = []
    for idx, r in enumerate(body.responses):
        response_id = f"{body.instance_id}/{idx + 1:04d}"
        q_id = q_list[r.question_index]["question_id"] if r.question_index < len(q_list) else None
        if q_id:
            response_rows.append({
                "response_id": response_id,
                "instance_id": body.instance_id,
                "question_id": q_id,
                "given_response": r.response_label or r.response_value,
                "response_value": float(r.response_value) if r.response_value.replace('.', '', 1).isdigit() else None,
            })
    if response_rows:
        admin.table("prs_responses").upsert(
            response_rows, on_conflict="instance_id,question_id"
        ).execute()

    # ── Mark permission completed ────────────────────────────────────────────
    admin.table("assessment_permissions").update({"status": "completed"}).eq(
        "patient_id", instance["patient_id"]
    ).eq("scale_id", body.scale_id).eq("status", "granted").execute()

    # ── prs_final_results is auto-calculated by DB trigger ───────────────────

    return success_response({
        "scale_result_id": scale_result_id,
        "calculated_value": score_result.total,
        "max_possible": score_result.max_possible,
        "severity_level": severity.level if severity else None,
        "severity_label": severity.label if severity else None,
    }, "Assessment submitted successfully")
