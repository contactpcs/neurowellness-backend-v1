from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, Request, HTTPException
from typing import Optional
from pydantic import BaseModel, EmailStr
from app.dependencies import require_staff, require_receptionist
from app.database import get_supabase_admin
from app.utils.responses import success_response, paginated_response
from app.utils.exceptions import NotFoundError, BadRequestError, ForbiddenError
from app.limiter import limiter

router = APIRouter()


def _row(admin, table: str, field: str, value: str) -> dict:
    result = admin.table(table).select("*").eq(field, value).limit(1).execute()
    return result.data[0] if result.data else {}


def _allocate_doctor(admin, city: Optional[str], state: Optional[str], clinic_id: Optional[str] = None) -> Optional[str]:
    def query_doctors(filters: dict) -> list:
        q = admin.table("doctors").select(
            "id, current_patient_count, max_patients"
        ).eq("availability", "available")
        if clinic_id:
            q = q.eq("clinic_id", clinic_id)
        for col, val in filters.items():
            q = q.eq(col, val)
        rows = q.execute().data or []
        return [r for r in rows if (r.get("current_patient_count") or 0) < (r.get("max_patients") or 50)]

    def pick_least_loaded(doctors: list) -> Optional[str]:
        if not doctors:
            return None
        return min(doctors, key=lambda d: d.get("current_patient_count") or 0)["id"]

    if city:
        city_ids = {r["id"] for r in (admin.table("profiles").select("id").eq("role", "doctor").eq("city", city).execute().data or [])}
        if city_ids:
            result = pick_least_loaded([d for d in query_doctors({}) if d["id"] in city_ids])
            if result:
                return result

    if state:
        state_ids = {r["id"] for r in (admin.table("profiles").select("id").eq("role", "doctor").eq("state", state).execute().data or [])}
        if state_ids:
            result = pick_least_loaded([d for d in query_doctors({}) if d["id"] in state_ids])
            if result:
                return result

    return pick_least_loaded(query_doctors({}))


@router.get("/dashboard")
@limiter.limit("60/minute")
async def staff_dashboard(request: Request, current_user: dict = Depends(require_staff)):
    admin = get_supabase_admin()
    role = current_user["role"]
    clinic_id = current_user.get("clinic_id")

    q = admin.table("patients").select("id")
    if clinic_id:
        q = q.eq("clinic_id", clinic_id)
    patients = q.execute().data or []
    patient_ids = [p["id"] for p in patients]

    pending_count = 0
    if patient_ids:
        perm_res = admin.table("assessment_permissions").select("id").in_(
            "patient_id", patient_ids
        ).eq("status", "granted").execute()
        pending_count = len(perm_res.data or [])

    # Pending approval count for this clinic
    pending_approval_q = admin.table("patients").select("id").eq("approval_status", "pending")
    if clinic_id:
        pending_approval_q = pending_approval_q.eq("clinic_id", clinic_id)
    pending_approval_count = len(pending_approval_q.execute().data or [])

    # Patients registered today (UTC). Frontend can display in IST without skew
    # because we compare against an absolute UTC instant, not a local-day boundary.
    today_utc = datetime.now(timezone.utc).date().isoformat()
    today_q = admin.table("patients").select("id").gte("created_at", f"{today_utc}T00:00:00Z")
    if clinic_id:
        today_q = today_q.eq("clinic_id", clinic_id)
    registered_today = len(today_q.execute().data or [])

    extra = {}
    if role == "receptionist":
        upcoming_q = admin.table("sessions").select("id, session_date, status, patient_id, doctor_id").in_(
            "status", ["scheduled", "in_progress"]
        ).order("session_date", desc=False).limit(5)
        if clinic_id:
            upcoming_q = upcoming_q.eq("clinic_id", clinic_id)
        extra["upcoming_sessions"] = upcoming_q.execute().data or []

    elif role == "clinical_assistant":
        recent_instances_q = admin.table("prs_assessment_instances").select(
            "instance_id, patient_id, status, started_at, completed_at"
        ).eq("status", "completed").order("completed_at", desc=True).limit(5)
        if clinic_id:
            recent_instances_q = recent_instances_q.eq("clinic_id", clinic_id)
        recent_instances = recent_instances_q.execute().data or []
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
            "pending_approval": pending_approval_count,
            "registered_today": registered_today,
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
    clinic_id = current_user.get("clinic_id")

    q = admin.table("patients").select(
        "id, assigned_doctor_id, clinic_id, approval_status, created_at, "
        "profiles(id, full_name, email, avatar_url, role, created_at)"
    ).eq("approval_status", "approved").is_("deleted_by", "null")

    if clinic_id:
        q = q.eq("clinic_id", clinic_id)

    result = q.range(skip, skip + limit - 1).execute()
    data = result.data or []

    if search:
        s = search.lower()
        data = [p for p in data if s in (p.get("profiles") or {}).get("full_name", "").lower()]

    return paginated_response(data, len(data), skip, limit)


@router.get("/patients/pending")
@limiter.limit("60/minute")
async def list_pending_patients(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_staff),
):
    """List patients awaiting approval for this clinic."""
    admin = get_supabase_admin()
    clinic_id = current_user.get("clinic_id")

    q = admin.table("patients").select(
        "id, assigned_doctor_id, clinic_id, approval_status, created_at, medical_history, emergency_contact, "
        "profiles(id, full_name, email, phone, city, state)"
    ).eq("approval_status", "pending").is_("deleted_by", "null")

    if clinic_id:
        q = q.eq("clinic_id", clinic_id)

    result = q.order("created_at", desc=True).range(skip, skip + limit - 1).execute()
    raw = result.data or []

    # Flatten profiles into patient row
    data = []
    for p in raw:
        prof = p.pop("profiles") or {}
        data.append({**p, **prof})

    return paginated_response(data, len(data), skip, limit)


@router.put("/patients/{patient_id}/approve")
@limiter.limit("30/minute")
async def approve_patient(
    request: Request,
    patient_id: str,
    current_user: dict = Depends(require_staff),
):
    """Approve a pending patient. Activates their account."""
    admin = get_supabase_admin()
    clinic_id = current_user.get("clinic_id")

    patient = _row(admin, "patients", "id", patient_id)
    if not patient:
        raise NotFoundError("Patient not found")
    if clinic_id and patient.get("clinic_id") != clinic_id:
        raise ForbiddenError("Patient does not belong to your clinic")
    if patient.get("approval_status") == "approved":
        raise BadRequestError("Patient is already approved")

    admin.table("patients").update({"approval_status": "approved"}).eq("id", patient_id).execute()
    admin.table("profiles").update({"is_active": True}).eq("id", patient_id).execute()

    # Trigger doctor allocation if not yet assigned
    if not patient.get("assigned_doctor_id"):
        prof = _row(admin, "profiles", "id", patient_id)
        doctor_id = _allocate_doctor(admin, prof.get("city"), prof.get("state"), clinic_id=clinic_id)
        if doctor_id:
            admin.table("patients").update({"assigned_doctor_id": doctor_id}).eq("id", patient_id).execute()
            admin.rpc("increment_doctor_patient_count", {"doctor_id": doctor_id}).execute()

    return success_response({"patient_id": patient_id}, "Patient approved and account activated")


class RejectPatientRequest(BaseModel):
    reason: Optional[str] = None


@router.put("/patients/{patient_id}/reject")
@limiter.limit("30/minute")
async def reject_patient(
    request: Request,
    patient_id: str,
    body: Optional[RejectPatientRequest] = None,
    current_user: dict = Depends(require_staff),
):
    """
    Reject and permanently delete a pending patient registration.
    Deletes consent responses, patient record, profile, and auth user.
    """
    admin = get_supabase_admin()
    clinic_id = current_user.get("clinic_id")

    patient = _row(admin, "patients", "id", patient_id)
    if not patient:
        raise NotFoundError("Patient not found")
    if clinic_id and patient.get("clinic_id") != clinic_id:
        raise ForbiddenError("Patient does not belong to your clinic")
    if patient.get("approval_status") == "rejected":
        raise BadRequestError("Patient is already rejected")

    try:
        admin.table("user_consent_responses").delete().eq("user_id", patient_id).execute()
        admin.table("patients").delete().eq("id", patient_id).execute()
        admin.table("profiles").delete().eq("id", patient_id).execute()
        admin.auth.admin.delete_user(patient_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reject patient: {e}")

    return success_response(
        {"patient_id": patient_id},
        "Patient registration rejected and all data removed.",
    )


class RegisterPatientRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    phone: str
    city: str
    state: str
    country: str = "India"
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address_line1: Optional[str] = None
    pincode: Optional[str] = None


@router.post("/patients/register")
@limiter.limit("10/minute")
async def register_patient(
    request: Request,
    body: RegisterPatientRequest,
    current_user: dict = Depends(require_staff),
):
    """
    Doctor or Receptionist registers a patient directly.
    Patient inherits the registering staff member's clinic.
    Account is immediately active (no approval needed).
    """
    if current_user["role"] == "clinical_assistant":
        raise ForbiddenError("Clinical assistants cannot register patients")

    if not body.date_of_birth:
        raise BadRequestError("Date of birth is required for patient registration.")

    if not body.gender:
        raise BadRequestError("Gender is required for patient registration.")

    admin = get_supabase_admin()
    clinic_id = current_user.get("clinic_id")
    if not clinic_id:
        raise BadRequestError("Your account is not associated with a clinic")

    # Create Supabase auth user
    try:
        user_res = admin.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        })
    except Exception as e:
        msg = str(e).lower()
        if "already registered" in msg or "already been registered" in msg:
            raise HTTPException(status_code=409, detail="Email already registered")
        raise HTTPException(status_code=400, detail=f"Could not create user: {e}")

    user_id = user_res.user.id

    # Allocate doctor before the transaction (read-only, safe outside)
    doctor_id = _allocate_doctor(admin, body.city, body.state, clinic_id=clinic_id)

    try:
        # Single atomic transaction: profiles + patients + doctor count increment
        admin.rpc("register_patient_db", {
            "p_id": user_id,
            "p_full_name": body.full_name,
            "p_email": body.email,
            "p_phone": body.phone,
            "p_city": body.city,
            "p_state": body.state,
            "p_country": body.country,
            "p_date_of_birth": body.date_of_birth,
            "p_gender": body.gender,
            "p_clinic_id": clinic_id,
            "p_is_active": True,
            "p_medical_history": None,
            "p_emergency_contact": None,
            "p_doctor_id": doctor_id,
            "p_approval_status": "approved",
            "p_address_line1": body.address_line1,
            "p_pincode": body.pincode,
        }).execute()
    except Exception as e:
        try:
            admin.auth.admin.delete_user(user_id)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Patient creation failed: {e}")

    return success_response({
        "patient_id": user_id,
        "clinic_id": clinic_id,
        "assigned_doctor_id": doctor_id,
    }, "Patient registered successfully", status_code=201)


@router.get("/patients/{patient_id}")
@limiter.limit("60/minute")
async def get_patient_detail(
    request: Request,
    patient_id: str,
    current_user: dict = Depends(require_staff),
):
    admin = get_supabase_admin()
    clinic_id = current_user.get("clinic_id")
    role = current_user["role"]

    patient = _row(admin, "patients", "id", patient_id)
    if not patient:
        raise NotFoundError("Patient not found")
    if clinic_id and patient.get("clinic_id") != clinic_id:
        raise ForbiddenError("Patient does not belong to your clinic")

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
    clinic_id = current_user.get("clinic_id")

    q = admin.table("profiles").select("id, full_name, email").eq("role", "doctor").eq("is_active", True)
    if clinic_id:
        q = q.eq("clinic_id", clinic_id)
    profiles = q.execute().data or []

    doc_ids = [p["id"] for p in profiles]
    doctors_data = []
    if doc_ids:
        doctors_data = admin.table("doctors").select(
            "id, specialization, availability, current_patient_count, max_patients"
        ).in_("id", doc_ids).execute().data or []
    doc_map = {d["id"]: d for d in doctors_data}

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
    clinic_id = current_user.get("clinic_id")

    patient = _row(admin, "patients", "id", patient_id)
    if not patient:
        raise NotFoundError("Patient not found")
    if clinic_id and patient.get("clinic_id") != clinic_id:
        raise ForbiddenError("Patient does not belong to your clinic")

    doctor = _row(admin, "doctors", "id", body.doctor_id)
    if not doctor:
        raise NotFoundError("Doctor not found")
    if clinic_id and doctor.get("clinic_id") != clinic_id:
        raise ForbiddenError("Doctor does not belong to your clinic")

    admin.table("patients").update({"assigned_doctor_id": body.doctor_id}).eq("id", patient_id).execute()
    admin.table("doctor_patient_allocations").upsert({
        "patient_id": patient_id,
        "doctor_id": body.doctor_id,
        "clinic_id": clinic_id,
        "is_active": True,
        "notes": body.notes,
    }, on_conflict="patient_id,doctor_id").execute()

    return success_response(
        {"patient_id": patient_id, "doctor_id": body.doctor_id},
        "Patient allocated to doctor successfully",
    )
