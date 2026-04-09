from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import json

from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.services.scale_engine import scale_engine
from app.utils.responses import success_response
from app.utils.exceptions import ForbiddenError, NotFoundError, BadRequestError
from app.limiter import limiter

router = APIRouter()


class StartAssessmentRequest(BaseModel):
    scale_id: str
    disease_id: Optional[str] = None
    taken_by: str = "patient"
    patient_id: Optional[str] = None  # required when taken_by == doctor_on_behalf


class ResponseItem(BaseModel):
    question_index: int
    response_value: str
    response_label: Optional[str] = None


class SubmitAssessmentRequest(BaseModel):
    instance_id: str
    scale_id: str
    responses: List[ResponseItem]


def _parse(val):
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return val
    return val


def _load_questions(admin, scale_id: str) -> list:
    questions = admin.table("prs_questions").select("*").eq(
        "scale_id", scale_id
    ).order("display_order").execute().data or []
    for idx, q in enumerate(questions):
        opts = admin.table("prs_options").select("*").eq(
            "question_id", q["question_id"]
        ).order("display_order").execute().data or []
        q["options"] = [
            {"value": o.get("option_value"), "label": o.get("option_label"), "points": o.get("points", 0)}
            for o in opts
        ]
        q["question_index"] = idx
        q["question_type"] = q.get("answer_type", "likert")
    return questions


@router.post("/start")
@limiter.limit("30/minute")
async def start_assessment(
    request: Request,
    body: StartAssessmentRequest,
    current_user: dict = Depends(get_current_user),
):
    admin = get_supabase_admin()
    role = current_user["role"]

    if body.taken_by == "patient" and role == "patient":
        patient_id = current_user["id"]
        perm = admin.table("assessment_permissions").select("id, doctor_id, disease_id").eq(
            "patient_id", patient_id
        ).eq("scale_id", body.scale_id).eq("status", "granted").execute().data or []
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
        ).eq("scale_id", body.scale_id).execute().data or []
        disease_id = (perm[0].get("disease_id") if perm else None) or body.disease_id

    else:
        raise ForbiddenError("Invalid role or taken_by combination")

    if not disease_id:
        link = admin.table("prs_disease_scale_map").select("disease_id").eq(
            "scale_id", body.scale_id
        ).limit(1).execute().data or []
        disease_id = link[0]["disease_id"] if link else None
    if not disease_id:
        raise BadRequestError("Cannot determine disease for this scale")

    existing = admin.table("prs_assessment_instances").select("instance_id").eq(
        "patient_id", patient_id
    ).execute().data or []
    seq = len(existing) + 1
    instance_id = f"PAT/{patient_id[:8]}/{seq:03d}"

    scale_result = admin.table("prs_scales").select("*").eq(
        "scale_id", body.scale_id
    ).limit(1).execute()
    if not scale_result.data:
        raise NotFoundError("Scale not found")
    scale = scale_result.data[0]

    questions = _load_questions(admin, body.scale_id)

    admin.table("prs_assessment_instances").insert({
        "instance_id": instance_id,
        "disease_id": disease_id,
        "patient_id": patient_id,
        "initiated_by": body.taken_by,
        "status": "in_progress",
    }).execute()

    return success_response({
        "instance_id": instance_id,
        "scale": {**scale, "questions": questions},
    })


@router.post("/submit")
@limiter.limit("30/minute")
async def submit_assessment(
    request: Request,
    body: SubmitAssessmentRequest,
    current_user: dict = Depends(get_current_user),
):
    admin = get_supabase_admin()
    role = current_user["role"]

    instance_result = admin.table("prs_assessment_instances").select("*").eq(
        "instance_id", body.instance_id
    ).limit(1).execute()
    if not instance_result.data:
        raise NotFoundError("Assessment instance not found")
    instance = instance_result.data[0]

    if instance["status"] != "in_progress":
        raise BadRequestError("Assessment already submitted")

    # Patients can only submit their own; doctors/CAs can submit for any patient
    user_id = current_user["id"]
    if role == "patient" and instance["patient_id"] != user_id:
        raise ForbiddenError("Not your assessment instance")
    if role not in {"patient", "doctor", "clinical_assistant", "admin"}:
        raise ForbiddenError("Not allowed to submit assessments")

    scale_result = admin.table("prs_scales").select("*").eq(
        "scale_id", body.scale_id
    ).limit(1).execute()
    if not scale_result.data:
        raise NotFoundError("Scale not found")
    scale = scale_result.data[0]

    questions = _load_questions(admin, body.scale_id)

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

    responses_dict = {r.question_index: r.response_value for r in body.responses}
    score_result = scale_engine.calculate_score(scale_config, responses_dict)
    severity    = scale_engine.get_severity(scale_config, score_result.total)
    risk_flags  = scale_engine.detect_risk_flags(scale_config, responses_dict, score_result)

    scale_result_id = f"{body.instance_id}/{body.scale_id}"
    admin.table("prs_scale_results").upsert({
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
    }, on_conflict="instance_id,scale_id").execute()

    response_rows = []
    for idx, r in enumerate(body.responses):
        response_id = f"{body.instance_id}/{idx + 1:04d}"
        q_id = questions[r.question_index]["question_id"] if r.question_index < len(questions) else None
        if q_id:
            response_rows.append({
                "response_id": response_id,
                "instance_id": body.instance_id,
                "question_id": q_id,
                "given_response": r.response_label or r.response_value,
                "response_value": float(r.response_value) if r.response_value.replace(".", "", 1).isdigit() else None,
            })
    if response_rows:
        admin.table("prs_responses").upsert(
            response_rows, on_conflict="instance_id,question_id"
        ).execute()

    # Mark permission completed
    admin.table("assessment_permissions").update({"status": "completed"}).eq(
        "patient_id", instance["patient_id"]
    ).eq("scale_id", body.scale_id).eq("status", "granted").execute()

    # Mark instance completed
    admin.table("prs_assessment_instances").update({
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("instance_id", body.instance_id).execute()

    return success_response({
        "scale_result_id": scale_result_id,
        "calculated_value": score_result.total,
        "max_possible": score_result.max_possible,
        "severity_level": severity.level if severity else None,
        "severity_label": severity.label if severity else None,
    }, "Assessment submitted successfully")
