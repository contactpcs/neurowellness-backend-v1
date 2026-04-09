from fastapi import APIRouter, Depends, Query, Request
from app.dependencies import get_current_user, require_staff
from app.database import get_supabase_admin
from app.utils.responses import success_response, paginated_response
from app.limiter import limiter

router = APIRouter()


@router.get("/me")
@limiter.limit("60/minute")
async def my_scores(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    admin = get_supabase_admin()
    instances = admin.table("prs_assessment_instances").select("instance_id").eq(
        "patient_id", current_user["id"]
    ).execute().data or []
    instance_ids = [i["instance_id"] for i in instances]
    if not instance_ids:
        return paginated_response([], 0, skip, limit)

    result = admin.table("prs_final_results").select(
        "final_result_id, instance_id, calculated_value, max_possible, percentage, "
        "overall_severity, overall_severity_label, scale_summaries, time_stamp"
    ).in_("instance_id", instance_ids).order(
        "time_stamp", desc=True
    ).range(skip, skip + limit - 1).execute()
    return paginated_response(result.data or [], len(result.data or []), skip, limit)


@router.get("/me/summary")
@limiter.limit("60/minute")
async def my_score_summary(request: Request, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    instances = admin.table("prs_assessment_instances").select("instance_id").eq(
        "patient_id", current_user["id"]
    ).execute().data or []
    instance_ids = [i["instance_id"] for i in instances]
    if not instance_ids:
        return success_response([])

    scores = admin.table("prs_final_results").select(
        "final_result_id, instance_id, calculated_value, max_possible, percentage, "
        "overall_severity, overall_severity_label, scale_summaries, time_stamp"
    ).in_("instance_id", instance_ids).order("time_stamp", desc=True).execute().data or []
    return success_response(scores)


@router.get("/patient/{patient_id}/summary")
@limiter.limit("60/minute")
async def patient_score_summary(
    request: Request,
    patient_id: str,
    current_user: dict = Depends(require_staff),
):
    admin = get_supabase_admin()
    instances = admin.table("prs_assessment_instances").select("instance_id").eq(
        "patient_id", patient_id
    ).execute().data or []
    instance_ids = [i["instance_id"] for i in instances]
    if not instance_ids:
        return success_response([])

    scores = admin.table("prs_final_results").select(
        "final_result_id, instance_id, calculated_value, max_possible, percentage, "
        "overall_severity, overall_severity_label, scale_summaries, time_stamp"
    ).in_("instance_id", instance_ids).order("time_stamp", desc=True).execute().data or []
    return success_response(scores)


@router.get("/patient/{patient_id}")
@limiter.limit("60/minute")
async def patient_scores(
    request: Request,
    patient_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_staff),
):
    admin = get_supabase_admin()
    instances = admin.table("prs_assessment_instances").select(
        "instance_id, disease_id, initiated_by, status, started_at, completed_at"
    ).eq("patient_id", patient_id).order(
        "started_at", desc=True
    ).range(skip, skip + limit - 1).execute().data or []

    for inst in instances:
        inst["scale_results"] = admin.table("prs_scale_results").select(
            "scale_result_id, scale_id, calculated_value, max_possible, percentage, "
            "severity_level, severity_label"
        ).eq("instance_id", inst["instance_id"]).execute().data or []

        inst["responses"] = admin.table("prs_responses").select(
            "question_id, given_response, response_value"
        ).eq("instance_id", inst["instance_id"]).execute().data or []

    return paginated_response(instances, len(instances), skip, limit)
