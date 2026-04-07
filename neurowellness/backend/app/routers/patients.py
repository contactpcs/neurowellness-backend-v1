from fastapi import APIRouter, Depends
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response

router = APIRouter()


@router.get("/dashboard")
async def patient_dashboard(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    patient_id = current_user["id"]

    profile = admin.table("profiles").select("*").eq("id", patient_id).single().execute().data
    patient = admin.table("patients").select("*").eq("id", patient_id).single().execute().data

    doctor_info = None
    if patient and patient.get("assigned_doctor_id"):
        dr_id = patient["assigned_doctor_id"]
        dr_profile = admin.table("profiles").select("full_name, avatar_url").eq("id", dr_id).single().execute().data
        dr_extra = admin.table("doctors").select("specialisation, hospital, phone").eq("id", dr_id).single().execute().data
        doctor_info = {**(dr_profile or {}), **(dr_extra or {})}

    pending = admin.table("assessment_permissions").select(
        "*, prs_scales(scale_code, scale_name)"
    ).eq("patient_id", patient_id).eq("status", "granted").execute().data

    # Recent scores from final results
    instances = admin.table("prs_assessment_instances").select("instance_id").eq(
        "patient_id", patient_id
    ).execute().data
    instance_ids = [i["instance_id"] for i in instances]
    recent_scores = []
    if instance_ids:
        recent_scores = admin.table("prs_final_results").select(
            "calculated_value, max_possible, overall_severity, overall_severity_label, time_stamp"
        ).in_("instance_id", instance_ids).order("time_stamp", desc=True).limit(3).execute().data

    upcoming_instances = admin.table("prs_assessment_instances").select("*").eq(
        "patient_id", patient_id
    ).eq("status", "in_progress").order("started_at").limit(2).execute().data

    return success_response({
        "profile": {**(profile or {}), **(patient or {})},
        "assigned_doctor": doctor_info,
        "pending_assessments": pending,
        "recent_scores": recent_scores,
        "upcoming_instances": upcoming_instances,
    })


@router.get("/my-doctor")
async def my_doctor(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    patient = admin.table("patients").select("assigned_doctor_id").eq("id", current_user["id"]).single().execute().data
    if not patient or not patient.get("assigned_doctor_id"):
        return success_response(None, "No doctor assigned yet")
    dr_id = patient["assigned_doctor_id"]
    profile = admin.table("profiles").select("full_name, avatar_url").eq("id", dr_id).single().execute().data
    extra = admin.table("doctors").select("specialisation, hospital, phone").eq("id", dr_id).single().execute().data
    return success_response({**(profile or {}), **(extra or {})})


@router.get("/my-assessments")
async def my_assessments(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    perms = admin.table("assessment_permissions").select(
        "*, prs_scales(scale_code, scale_name)"
    ).eq("patient_id", current_user["id"]).order("granted_at", desc=True).execute().data
    return success_response(perms)


@router.get("/my-scores")
async def my_scores(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    instances = admin.table("prs_assessment_instances").select("instance_id").eq(
        "patient_id", current_user["id"]
    ).execute().data
    instance_ids = [i["instance_id"] for i in instances]
    if not instance_ids:
        return success_response([])
    scores = admin.table("prs_final_results").select(
        "final_result_id, instance_id, calculated_value, max_possible, percentage, "
        "overall_severity, overall_severity_label, scale_summaries, time_stamp"
    ).in_("instance_id", instance_ids).order("time_stamp", desc=True).execute().data
    return success_response(scores)
