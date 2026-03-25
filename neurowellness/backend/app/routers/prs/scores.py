from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.dependencies import get_current_user, require_doctor
from app.database import get_supabase_admin
from app.utils.responses import success_response, paginated_response

router = APIRouter()


@router.get("/me")
async def my_scores(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    admin = get_supabase_admin()
    result = admin.table("assessment_scores").select(
        "id, total_score, max_possible, overall_severity, overall_severity_label, "
        "scale_summaries, calculated_at"
    ).eq("patient_id", current_user["id"]).order(
        "calculated_at", desc=True
    ).range(skip, skip + limit - 1).execute()
    return paginated_response(result.data, len(result.data), skip, limit)


@router.get("/me/summary")
async def my_score_summary(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    scores = admin.table("assessment_scores").select(
        "id, total_score, max_possible, overall_severity, overall_severity_label, "
        "scale_summaries, calculated_at"
    ).eq("patient_id", current_user["id"]).order("calculated_at", desc=True).execute().data
    return success_response(scores)


@router.get("/patient/{patient_id}/summary")
async def patient_score_summary(patient_id: str, current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    scores = admin.table("assessment_scores").select(
        "id, total_score, max_possible, overall_severity, overall_severity_label, "
        "scale_summaries, calculated_at"
    ).eq("patient_id", patient_id).order("calculated_at", desc=True).execute().data
    return success_response(scores)


@router.get("/patient/{patient_id}")
async def patient_scores(
    patient_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_doctor),
):
    admin = get_supabase_admin()
    scores = admin.table("assessment_scores").select(
        "*, assessment_sessions(id, taken_by, started_at, completed_at)"
    ).eq("patient_id", patient_id).order(
        "calculated_at", desc=True
    ).range(skip, skip + limit - 1).execute().data

    for score in scores:
        session = score.get("assessment_sessions") or {}
        session_id = session.get("id")
        if session_id:
            responses = admin.table("assessment_responses").select(
                "question_index, response_value, response_label"
            ).eq("assessment_session_id", session_id).order("question_index").execute().data
            score["responses"] = responses

    return paginated_response(scores, len(scores), skip, limit)
