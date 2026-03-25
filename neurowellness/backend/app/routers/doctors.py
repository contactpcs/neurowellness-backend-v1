from fastapi import APIRouter, Depends, Query
from typing import Optional
from pydantic import BaseModel
from app.dependencies import require_doctor
from app.database import get_supabase_admin
from app.utils.responses import success_response, paginated_response
from app.utils.exceptions import ForbiddenError

router = APIRouter()


@router.get("/dashboard")
async def doctor_dashboard(current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    doctor_id = current_user["id"]

    profile = admin.table("profiles").select("*").eq("id", doctor_id).single().execute().data
    doctor = admin.table("doctors").select("*").eq("id", doctor_id).single().execute().data

    patients = admin.table("patients").select("id").eq("assigned_doctor_id", doctor_id).execute().data
    total_patients = len(patients)
    patient_ids = [p["id"] for p in patients]

    pending = 0
    if patient_ids:
        perm_res = admin.table("assessment_permissions").select("id").in_(
            "patient_id", patient_ids
        ).eq("status", "granted").execute()
        pending = len(perm_res.data)

    recent = []
    if patient_ids:
        recent_res = admin.table("assessment_scores").select(
            "total_score, max_possible, overall_severity_label, calculated_at"
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
    )
    result = query.range(skip, skip + limit - 1).execute()
    data = result.data

    if search:
        search_lower = search.lower()
        data = [
            p for p in data
            if search_lower in (p.get("profiles") or {}).get("full_name", "").lower()
            or search_lower in (p.get("profiles") or {}).get("email", "").lower()
        ]

    return paginated_response(data, len(data), skip, limit)


@router.get("/patients/{patient_id}")
async def get_patient_detail(patient_id: str, current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    patient = admin.table("patients").select("*").eq("id", patient_id).single().execute().data
    if not patient:
        raise ForbiddenError("Patient not found")

    profile = admin.table("profiles").select("*").eq("id", patient_id).single().execute().data
    permissions = admin.table("assessment_permissions").select(
        "*, prs_scales(scale_code, name, short_name)"
    ).eq("patient_id", patient_id).order("granted_at", desc=True).execute().data
    scores_summary = admin.table("assessment_scores").select(
        "total_score, max_possible, overall_severity, overall_severity_label, calculated_at"
    ).eq("patient_id", patient_id).order("calculated_at", desc=True).limit(10).execute().data
    sessions = admin.table("assessment_sessions").select("*").eq("patient_id", patient_id).eq(
        "doctor_id", current_user["id"]
    ).order("created_at", desc=True).limit(5).execute().data

    return success_response({
        "patient": {**(patient or {}), **(profile or {})},
        "permissions": permissions,
        "scores_summary": scores_summary,
        "sessions": sessions,
    })


class GrantAssessmentRequest(BaseModel):
    scale_id: str
    session_id: Optional[str] = None
    notes: Optional[str] = None


@router.post("/patients/{patient_id}/grant-assessment")
async def grant_assessment(
    patient_id: str,
    body: GrantAssessmentRequest,
    current_user: dict = Depends(require_doctor),
):
    admin = get_supabase_admin()
    patient = admin.table("patients").select("id").eq("id", patient_id).single().execute().data
    if not patient:
        raise ForbiddenError("Patient not found")

    perm = {
        "patient_id": patient_id,
        "doctor_id": current_user["id"],
        "scale_id": body.scale_id,
        "session_id": body.session_id,
        "status": "granted",
        "notes": body.notes,
    }
    result = admin.table("assessment_permissions").upsert(
        perm, on_conflict="patient_id,scale_id,session_id"
    ).execute()
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
    availability: str


@router.put("/availability")
async def update_availability(body: AvailabilityUpdate, current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    result = admin.table("doctors").update({"availability": body.availability}).eq("id", current_user["id"]).execute()
    return success_response(result.data[0] if result.data else {}, "Availability updated")
