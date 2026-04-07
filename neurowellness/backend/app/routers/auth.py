from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response

router = APIRouter()


def _allocate_doctor(admin, city: Optional[str], state: Optional[str]) -> Optional[str]:
    """
    Find the best available doctor to assign to a new patient.
    Priority: same city → same state → any available doctor.
    Within each tier, pick the one with the fewest current patients.
    """
    def query_doctors(filters: dict) -> list:
        q = admin.table("doctors").select(
            "id, current_patient_count, max_patients"
        ).eq("availability", "available")
        for col, val in filters.items():
            q = q.eq(col, val)
        rows = q.execute().data or []
        # Only doctors under their max_patients limit
        return [r for r in rows if (r.get("current_patient_count") or 0) < (r.get("max_patients") or 50)]

    def pick_least_loaded(doctors: list) -> Optional[str]:
        if not doctors:
            return None
        return min(doctors, key=lambda d: d.get("current_patient_count") or 0)["id"]

    # Try city match first (join via profiles)
    if city:
        city_doctors = admin.table("profiles").select("id").eq("role", "doctor").eq(
            "city", city
        ).execute().data or []
        city_ids = [r["id"] for r in city_doctors]
        if city_ids:
            candidates = query_doctors({})
            city_candidates = [d for d in candidates if d["id"] in city_ids]
            result = pick_least_loaded(city_candidates)
            if result:
                return result

    # Try state match
    if state:
        state_doctors = admin.table("profiles").select("id").eq("role", "doctor").eq(
            "state", state
        ).execute().data or []
        state_ids = [r["id"] for r in state_doctors]
        if state_ids:
            candidates = query_doctors({})
            state_candidates = [d for d in candidates if d["id"] in state_ids]
            result = pick_least_loaded(state_candidates)
            if result:
                return result

    # Fallback: any available doctor
    candidates = query_doctors({})
    return pick_least_loaded(candidates)


class RegistrationSyncRequest(BaseModel):
    full_name: str
    email: EmailStr
    role: str  # 'doctor', 'patient', 'receptionist', or 'clinical_assistant'
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: str = "India"
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    # Doctor fields
    specialization: Optional[str] = None
    license_number: Optional[str] = None
    hospital_affiliation: Optional[str] = None
    years_of_experience: Optional[int] = None
    # Patient fields
    medical_history: Optional[str] = None
    emergency_contact: Optional[str] = None
    # Staff fields
    employee_id: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None


@router.post("/sync-profile")
async def sync_profile(
    body: RegistrationSyncRequest,
    current_user: dict = Depends(get_current_user),
):
    """Called from frontend after Supabase auth.signUp to create DB profile."""
    admin = get_supabase_admin()
    user_id = current_user["id"]

    valid_roles = ["doctor", "patient", "admin", "receptionist", "clinical_assistant"]
    if body.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {valid_roles}")

    profile_data = {
        "id": user_id,
        "role": body.role,
        "full_name": body.full_name,
        "email": body.email,
        "phone": body.phone,
        "city": body.city,
        "state": body.state,
        "country": body.country,
        "date_of_birth": body.date_of_birth,
        "gender": body.gender,
        "is_active": True,
    }
    admin.table("profiles").upsert(profile_data).execute()

    if body.role == "doctor":
        admin.table("doctors").upsert({
            "id": user_id,
            "specialization": body.specialization,
            "license_number": body.license_number,
            "hospital_affiliation": body.hospital_affiliation,
            "years_of_experience": body.years_of_experience,
            "availability": "available",
            "current_patient_count": 0,
            "max_patients": 50,
        }).execute()

    elif body.role == "patient":
        admin.table("patients").upsert({
            "id": user_id,
            "medical_history": body.medical_history,
            "emergency_contact": body.emergency_contact,
        }).execute()
        # Allocate doctor: prefer same city, then same state, then any available doctor
        assigned_doctor_id = _allocate_doctor(admin, body.city, body.state)
        if assigned_doctor_id:
            admin.table("patients").update({
                "assigned_doctor_id": assigned_doctor_id,
            }).eq("id", user_id).execute()
            # Log in doctor_patient_allocations
            admin.table("doctor_patient_allocations").upsert({
                "patient_id": user_id,
                "doctor_id": assigned_doctor_id,
                "allocation_reason": "auto_city_load_balance",
                "is_active": True,
            }, on_conflict="patient_id,doctor_id").execute()
            # Increment doctor's patient count
            doctor_row = admin.table("doctors").select("current_patient_count").eq(
                "id", assigned_doctor_id
            ).single().execute().data
            if doctor_row:
                new_count = (doctor_row.get("current_patient_count") or 0) + 1
                admin.table("doctors").update({
                    "current_patient_count": new_count
                }).eq("id", assigned_doctor_id).execute()

    elif body.role == "receptionist":
        admin.table("receptionists").upsert({
            "id": user_id,
            "employee_id": body.employee_id,
            "department": body.department,
            "designation": body.designation,
            "is_active": True,
        }).execute()

    elif body.role == "clinical_assistant":
        admin.table("clinical_assistants").upsert({
            "id": user_id,
            "employee_id": body.employee_id,
            "department": body.department,
            "designation": body.designation,
            "is_active": True,
        }).execute()

    elif body.role == "admin":
        admin.table("admins").upsert({
            "id": user_id,
            "employee_id": body.employee_id,
            "department": body.department,
            "is_active": True,
        }).execute()

    return success_response({"role": body.role, "id": user_id}, "Profile synced successfully")


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user profile"""
    if not current_user.get("role"):
        # Valid token but no profile row — tell the frontend to complete setup
        raise HTTPException(status_code=404, detail="PROFILE_NOT_FOUND")

    admin = get_supabase_admin()
    user_id = current_user["id"]

    profile = admin.table("profiles").select("*").eq("id", user_id).single().execute().data
    if not profile:
        raise HTTPException(status_code=404, detail="PROFILE_NOT_FOUND")

    if profile["role"] == "doctor":
        extra = admin.table("doctors").select("*").eq("id", user_id).single().execute().data or {}
    elif profile["role"] == "patient":
        extra = admin.table("patients").select("*").eq("id", user_id).single().execute().data or {}
    elif profile["role"] == "receptionist":
        extra = admin.table("receptionists").select("*").eq("id", user_id).single().execute().data or {}
    elif profile["role"] == "clinical_assistant":
        extra = admin.table("clinical_assistants").select("*").eq("id", user_id).single().execute().data or {}
    elif profile["role"] == "admin":
        extra = admin.table("admins").select("*").eq("id", user_id).single().execute().data or {}
    else:
        extra = {}

    return success_response({**profile, **extra})
