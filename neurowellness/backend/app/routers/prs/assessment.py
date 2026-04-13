from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone

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


class SaveResponseRequest(BaseModel):
    instance_id: str
    scale_id: str
    question_index: int
    question_id: Optional[str] = None   # if already known, skip the lookup
    response_value: str
    response_label: Optional[str] = None


def _fetch_questions_for_scoring(admin, scale_id: str) -> list:
    """
    Internal-only helper used by /submit for score calculation.
    Fetches questions + their options (points) in two batch queries.
    NOT exposed as an API endpoint — use GET /prs/questions/{id}/options for that.
    """
    questions = admin.table("prs_questions").select(
        "question_id, answer_type, display_order"
    ).eq("scale_id", scale_id).order("display_order").execute().data or []

    if not questions:
        return []

    q_ids = [q["question_id"] for q in questions]
    all_opts = admin.table("prs_options").select(
        "question_id, option_value, points"
    ).in_("question_id", q_ids).execute().data or []

    opts_by_q: dict = {}
    for o in all_opts:
        opts_by_q.setdefault(o["question_id"], []).append({
            "value":  o["option_value"],
            "points": o.get("points", 0),
        })

    for idx, q in enumerate(questions):
        q["options"]         = opts_by_q.get(q["question_id"], [])
        q["question_index"]  = idx

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

    # Return questions WITHOUT options — frontend fetches options per question
    # via GET /prs/questions/{question_id}/options
    questions = admin.table("prs_questions").select(
        "question_id, question_text, answer_type, min_value, max_value, "
        "is_required, skip_logic, display_order"
    ).eq("scale_id", body.scale_id).order("display_order").execute().data or []

    for idx, q in enumerate(questions):
        q["question_index"] = idx

    admin.table("prs_assessment_instances").insert({
        "instance_id":   instance_id,
        "disease_id":    disease_id,
        "patient_id":    patient_id,
        "initiated_by":  body.taken_by,
        "status":        "in_progress",
    }).execute()

    return success_response({
        "instance_id": instance_id,
        "scale":       {**scale, "questions": questions},
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

    # Fetch questions + options (points only) for scoring — internal batch query
    questions = _fetch_questions_for_scoring(admin, body.scale_id)

    scale_config = {
        "id":            scale.get("scale_code"),
        "scoringMethod": "sum",
        "scoringType":   "sum",
        "questions": [
            {
                "index":   q["question_index"],
                "type":    q.get("answer_type", "likert"),
                "options": q.get("options", []),
            }
            for q in questions
        ],
    }

    responses_dict = {r.question_index: r.response_value for r in body.responses}
    score_result = scale_engine.calculate_score(scale_config, responses_dict)
    severity     = scale_engine.get_severity(scale_config, score_result.total)
    risk_flags   = scale_engine.detect_risk_flags(scale_config, responses_dict, score_result)

    scale_result_id = f"{body.instance_id}/{body.scale_id}"
    admin.table("prs_scale_results").upsert({
        "scale_result_id":  scale_result_id,
        "instance_id":      body.instance_id,
        "scale_id":         body.scale_id,
        "calculated_value": score_result.total,
        "max_possible":     score_result.max_possible,
        "severity_level":   severity.level if severity else None,
        "severity_label":   severity.label if severity else None,
        "subscale_scores":  score_result.subscale_scores or {},
        "risk_flags":       [rf.__dict__ for rf in risk_flags],
        "raw_score_data":   score_result.extra or {},
    }, on_conflict="instance_id,scale_id").execute()

    # Persist individual responses
    response_rows = []
    for idx, r in enumerate(body.responses):
        response_id = f"{body.instance_id}/{idx + 1:04d}"
        q_id = questions[r.question_index]["question_id"] if r.question_index < len(questions) else None
        if q_id:
            response_rows.append({
                "response_id":    response_id,
                "instance_id":    body.instance_id,
                "question_id":    q_id,
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
        "status":       "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("instance_id", body.instance_id).execute()

    return success_response({
        "scale_result_id":  scale_result_id,
        "calculated_value": score_result.total,
        "max_possible":     score_result.max_possible,
        "severity_level":   severity.level if severity else None,
        "severity_label":   severity.label if severity else None,
    }, "Assessment submitted successfully")


# ── Incremental response endpoints ────────────────────────────────────────────

@router.post("/save-response")
@limiter.limit("120/minute")
async def save_response(
    request: Request,
    body: SaveResponseRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Save a single question response while the assessment is in progress.
    Upserts on (instance_id, question_id) so re-answering a question is safe.
    """
    admin = get_supabase_admin()

    instance_result = admin.table("prs_assessment_instances").select(
        "instance_id, patient_id, status"
    ).eq("instance_id", body.instance_id).limit(1).execute()
    if not instance_result.data:
        raise NotFoundError("Assessment instance not found")
    instance = instance_result.data[0]

    if instance["status"] == "completed":
        raise BadRequestError("Assessment already submitted — cannot save more responses")

    role = current_user["role"]
    if role == "patient" and instance["patient_id"] != current_user["id"]:
        raise ForbiddenError("Not your assessment instance")

    q_id = body.question_id
    if not q_id:
        questions = admin.table("prs_questions").select("question_id").eq(
            "scale_id", body.scale_id
        ).order("display_order").execute().data or []
        if body.question_index >= len(questions):
            raise BadRequestError(
                f"question_index {body.question_index} out of range "
                f"({len(questions)} questions in this scale)"
            )
        q_id = questions[body.question_index]["question_id"]

    response_id = f"{body.instance_id}/{q_id}"
    val = body.response_value

    admin.table("prs_responses").upsert({
        "response_id":    response_id,
        "instance_id":    body.instance_id,
        "question_id":    q_id,
        "given_response": body.response_label or val,
        "response_value": float(val) if val.replace(".", "", 1).isdigit() else None,
    }, on_conflict="instance_id,question_id").execute()

    return success_response({
        "response_id":    response_id,
        "instance_id":    body.instance_id,
        "question_id":    q_id,
        "question_index": body.question_index,
        "response_value": val,
        "response_label": body.response_label,
    }, "Response saved")


@router.get("/{instance_id}/responses")
@limiter.limit("60/minute")
async def get_instance_responses(
    request: Request,
    instance_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Return all saved responses for an in-progress instance.
    Used to resume an assessment that was interrupted.
    """
    admin = get_supabase_admin()

    instance_result = admin.table("prs_assessment_instances").select(
        "instance_id, patient_id, disease_id, status, started_at"
    ).eq("instance_id", instance_id).limit(1).execute()
    if not instance_result.data:
        raise NotFoundError("Assessment instance not found")
    instance = instance_result.data[0]

    role = current_user["role"]
    if role == "patient" and instance["patient_id"] != current_user["id"]:
        raise ForbiddenError("Not your assessment instance")

    responses = admin.table("prs_responses").select(
        "response_id, question_id, given_response, response_value"
    ).eq("instance_id", instance_id).execute().data or []

    by_question = {
        r["question_id"]: {
            "response_id":    r["response_id"],
            "given_response": r["given_response"],
            "response_value": r["response_value"],
        }
        for r in responses
    }

    return success_response({
        "instance_id":      instance_id,
        "status":           instance["status"],
        "responses_count":  len(responses),
        "responses":        responses,
        "responses_by_qid": by_question,
    })
