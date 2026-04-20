from fastapi import APIRouter, Depends, Query, Request
from typing import Optional
from pydantic import BaseModel
from app.dependencies import require_staff, require_receptionist
from app.database import get_supabase_admin
from app.utils.responses import success_response, paginated_response
from app.utils.exceptions import NotFoundError
from app.limiter import limiter

router = APIRouter()


def _row(admin, table: str, field: str, value: str) -> dict:
    result = admin.table(table).select("*").eq(field, value).limit(1).execute()
    return result.data[0] if result.data else {}


@router.get("/dashboard")
@limiter.limit("60/minute")
async def staff_dashboard(request: Request, current_user: dict = Depends(require_staff)):
    admin = get_supabase_admin()
    role = current_user["role"]

    patients = admin.table("patients").select("id").execute().data or []
    patient_ids = [p["id"] for p in patients]

    pending_count = 0
    if patient_ids:
        perm_res = admin.table("assessment_permissions").select("id").in_(
            "patient_id", patient_ids
        ).eq("status", "granted").execute()
        pending_count = len(perm_res.data or [])

    extra = {}
    if role == "receptionist":
        upcoming = admin.table("sessions").select(
            "id, session_date, status, patient_id, doctor_id"
        ).in_("status", ["scheduled", "in_progress"]).order(
            "session_date", desc=False
        ).limit(5).execute().data or []
        extra["upcoming_sessions"] = upcoming

    elif role == "clinical_assistant":
        recent_instances = admin.table("prs_assessment_instances").select(
            "instance_id, patient_id, status, started_at, completed_at"
        ).eq("status", "completed").order("completed_at", desc=True).limit(5).execute().data or []
        instance_ids = [i["instance_id"] for i in recent_instances]
        recent_scores = []
        if instance_ids:
            recent_scores = admin.table("prs_final_results").select(
                "calculated_value, max_possible, overall_severity_label, time_stamp"
            ).in_("instance_id", instance_ids).order("time_stamp", desc=True).limit(5).execute().data or []
        extra["recent_scores"] = recent_scores

    return success_response({
        "role": role,
        "patients_summary": {
            "total": len(patients),
            "pending_assessments": pending_count,
        },
        **extra,
    })


@router.get("/patients")
@limiter.limit("60/minute")
async def list_patients(
    request: Request,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_staff),
):
    admin = get_supabase_admin()
    result = admin.table("patients").select(
        "id, assigned_doctor_id, created_at, "
        "profiles(id, full_name, avatar_url, role, created_at)"
    ).range(skip, skip + limit - 1).execute()
    data = result.data or []

    if search:
        s = search.lower()
        data = [p for p in data if s in (p.get("profiles") or {}).get("full_name", "").lower()]

    return paginated_response(data, len(data), skip, limit)


@router.get("/patients/{patient_id}")
@limiter.limit("60/minute")
async def get_patient_detail(
    request: Request,
    patient_id: str,
    current_user: dict = Depends(require_staff),
):
    admin = get_supabase_admin()
    role = current_user["role"]

    patient = _row(admin, "patients", "id", patient_id)
    if not patient:
        raise NotFoundError("Patient not found")

    profile = _row(admin, "profiles", "id", patient_id)

    recent_sessions = admin.table("sessions").select("*").eq(
        "patient_id", patient_id
    ).order("session_date", desc=True).limit(10).execute().data or []

    result = {
        "patient": {**patient, **profile},
        "recent_sessions": recent_sessions,
    }

    if role == "clinical_assistant":
        permissions = admin.table("assessment_permissions").select(
            "*, prs_diseases(disease_id, disease_name)"
        ).eq("patient_id", patient_id).order("granted_at", desc=True).execute().data or []

        instances = admin.table("prs_assessment_instances").select("instance_id").eq(
            "patient_id", patient_id
        ).execute().data or []
        instance_ids = [i["instance_id"] for i in instances]
        scores_summary = []
        if instance_ids:
            scores_summary = admin.table("prs_final_results").select(
                "calculated_value, max_possible, overall_severity, overall_severity_label, time_stamp"
            ).in_("instance_id", instance_ids).order("time_stamp", desc=True).limit(10).execute().data or []

        result["permissions"] = permissions
        result["scores_summary"] = scores_summary

    return success_response(result)


@router.get("/doctors")
@limiter.limit("60/minute")
async def list_doctors(request: Request, current_user: dict = Depends(require_staff)):
    admin = get_supabase_admin()
    profiles = admin.table("profiles").select(
        "id, full_name, email"
    ).eq("role", "doctor").eq("is_active", True).execute().data or []
    doctors = admin.table("doctors").select(
        "id, specialization, availability, current_patient_count, max_patients"
    ).execute().data or []
    doc_map = {d["id"]: d for d in doctors}
    result = []
    for p in profiles:
        d = doc_map.get(p["id"], {})
        result.append({
            "id": p["id"],
            "full_name": p["full_name"],
            "email": p["email"],
            "specialization": d.get("specialization"),
            "availability": d.get("availability"),
            "current_patient_count": d.get("current_patient_count", 0),
            "max_patients": d.get("max_patients", 50),
        })
    return success_response(result)


class AllocatePatientRequest(BaseModel):
    doctor_id: str
    notes: Optional[str] = None


@router.post("/patients/{patient_id}/allocate")
@limiter.limit("20/minute")
async def allocate_patient_to_doctor(
    request: Request,
    patient_id: str,
    body: AllocatePatientRequest,
    current_user: dict = Depends(require_receptionist),
):
    admin = get_supabase_admin()

    patient = _row(admin, "patients", "id", patient_id)
    if not patient:
        raise NotFoundError("Patient not found")

    doctor = _row(admin, "doctors", "id", body.doctor_id)
    if not doctor:
        raise NotFoundError("Doctor not found")

    admin.table("patients").update({
        "assigned_doctor_id": body.doctor_id,
    }).eq("id", patient_id).execute()

    admin.table("doctor_patient_allocations").upsert({
        "patient_id": patient_id,
        "doctor_id": body.doctor_id,
        "is_active": True,
        "notes": body.notes,
    }, on_conflict="patient_id,doctor_id").execute()

    return success_response(
        {"patient_id": patient_id, "doctor_id": body.doctor_id},
        "Patient allocated to doctor successfully",
    )
