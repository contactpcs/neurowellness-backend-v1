from fastapi import APIRouter, Depends, Request
from app.dependencies import get_current_user, require_patient
from app.database import get_supabase_admin
from app.utils.responses import success_response
from app.limiter import limiter

router = APIRouter()


def _row(admin, table: str, field: str, value: str) -> dict:
    result = admin.table(table).select("*").eq(field, value).limit(1).execute()
    return result.data[0] if result.data else {}


@router.get("/dashboard")
@limiter.limit("60/minute")
async def patient_dashboard(request: Request, current_user: dict = Depends(require_patient)):
    admin = get_supabase_admin()
    patient_id = current_user["id"]

    profile = _row(admin, "profiles", "id", patient_id)
    patient = _row(admin, "patients", "id", patient_id)

    doctor_info = None
    if patient.get("assigned_doctor_id"):
        dr_id = patient["assigned_doctor_id"]
        dr_profile = _row(admin, "profiles", "id", dr_id)
        dr_extra  = _row(admin, "doctors",  "id", dr_id)
        doctor_info = {
            "full_name":          dr_profile.get("full_name"),
            "phone":              dr_profile.get("phone"),
            "specialization":     dr_extra.get("specialization"),
            "hospital_affiliation": dr_extra.get("hospital_affiliation"),
        }

    # Defense-in-depth: query is scoped in SQL AND re-filtered in Python to
    # guarantee we never return permissions for a different patient.
    pending_res = admin.table("assessment_permissions").select(
        "*, prs_scales(scale_code, scale_name)"
    ).eq("patient_id", patient_id).eq("status", "granted").execute()
    pending = pending_res.data or []
    pending = [
        p for p in pending
        if p.get("patient_id") == patient_id and p.get("status") == "granted"
    ]

    instances = admin.table("prs_assessment_instances").select("instance_id").eq(
        "patient_id", patient_id
    ).execute().data or []
    instance_ids = [i["instance_id"] for i in instances]

    recent_scores = []
    if instance_ids:
        recent_scores = admin.table("prs_final_results").select(
            "calculated_value, max_possible, overall_severity, overall_severity_label, time_stamp"
        ).in_("instance_id", instance_ids).order("time_stamp", desc=True).limit(3).execute().data or []

    upcoming_instances = admin.table("prs_assessment_instances").select("*").eq(
        "patient_id", patient_id
    ).eq("status", "in_progress").order("started_at").limit(2).execute().data or []

    return success_response({
        "profile": {**profile, **patient},
        "assigned_doctor": doctor_info,
        "pending_assessments": pending,
        "recent_scores": recent_scores,
        "upcoming_instances": upcoming_instances,
    })


@router.get("/my-doctor")
@limiter.limit("60/minute")
async def my_doctor(request: Request, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    patient = _row(admin, "patients", "id", current_user["id"])
    if not patient.get("assigned_doctor_id"):
        return success_response(None, "No doctor assigned yet")
    dr_id = patient["assigned_doctor_id"]
    dr_profile = _row(admin, "profiles", "id", dr_id)
    dr_extra  = _row(admin, "doctors",  "id", dr_id)
    return success_response({
        "full_name":            dr_profile.get("full_name"),
        "phone":                dr_profile.get("phone"),
        "specialization":       dr_extra.get("specialization"),
        "hospital_affiliation": dr_extra.get("hospital_affiliation"),
    })


@router.get("/my-assessments")
@limiter.limit("60/minute")
async def my_assessments(request: Request, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    perms = admin.table("assessment_permissions").select(
        "*, prs_scales(scale_id, scale_code, scale_name), prs_diseases(disease_id, disease_name)"
    ).eq("patient_id", current_user["id"]).order("granted_at", desc=True).execute().data or []
    return success_response(perms)


@router.get("/my-scores")
@limiter.limit("60/minute")
async def my_scores(request: Request, current_user: dict = Depends(get_current_user)):
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
