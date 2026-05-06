from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from typing import Optional
from supabase import create_client
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.config import get_settings
from app.utils.responses import success_response
from app.limiter import limiter

router = APIRouter()

# Only patients may self-register. All other roles are created by admin.
PUBLIC_REGISTER_ROLES = {"patient"}


def _row(admin, table: str, field: str, value: str) -> Optional[dict]:
    result = admin.table(table).select("*").eq(field, value).limit(1).execute()
    return result.data[0] if result.data else None


def _allocate_doctor(admin, city: Optional[str], state: Optional[str], clinic_id: Optional[str] = None) -> Optional[str]:
    """
    Find the best available doctor for a new patient.
    Priority: same city → same state → any available.
    Scoped to clinic_id when provided.
    """
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
        city_doctor_ids = {
            r["id"] for r in (
                admin.table("profiles").select("id").eq("role", "doctor").eq("city", city).execute().data or []
            )
        }
        if city_doctor_ids:
            candidates = [d for d in query_doctors({}) if d["id"] in city_doctor_ids]
            result = pick_least_loaded(candidates)
            if result:
                return result

    if state:
        state_doctor_ids = {
            r["id"] for r in (
                admin.table("profiles").select("id").eq("role", "doctor").eq("state", state).execute().data or []
            )
        }
        if state_doctor_ids:
            candidates = [d for d in query_doctors({}) if d["id"] in state_doctor_ids]
            result = pick_least_loaded(candidates)
            if result:
                return result

    return pick_least_loaded(query_doctors({}))


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegistrationSyncRequest(BaseModel):
    full_name: str
    email: EmailStr
    role: str
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: str = "India"
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    medical_history: Optional[str] = None
    emergency_contact: Optional[str] = None
    employee_id: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None


class RegisterRequest(RegistrationSyncRequest):
    password: str
    clinic_id: Optional[str] = None  # required for patient self-registration


@router.get("/clinics")
@limiter.limit("30/minute")
async def list_active_clinics(request: Request):
    """Public endpoint — returns active clinics for the self-registration clinic picker."""
    admin = get_supabase_admin()
    clinics = admin.table("clinics").select(
        "clinic_id, clinic_name, city, state, address"
    ).eq("is_active", True).order("clinic_name").execute().data or []
    return success_response(clinics)


@router.post("/register")
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest):
    """
    Public self-registration — patients only.
    Patient account is created with is_active=False and approval_status='pending'
    until a receptionist or admin approves it.
    """
    if body.role not in PUBLIC_REGISTER_ROLES:
        raise HTTPException(
            status_code=400,
            detail="Public registration is only available for patients. Staff accounts are created by a clinic admin.",
        )

    if not body.clinic_id:
        raise HTTPException(status_code=400, detail="Please select your nearest clinic to complete registration.")

    if not body.date_of_birth:
        raise HTTPException(status_code=400, detail="Date of birth is required for patient registration.")

    if not body.gender:
        raise HTTPException(status_code=400, detail="Gender is required for patient registration.")

    admin = get_supabase_admin()

    # Verify clinic exists and is active
    clinic = admin.table("clinics").select("clinic_id, clinic_name").eq(
        "clinic_id", body.clinic_id
    ).eq("is_active", True).limit(1).execute().data
    if not clinic:
        raise HTTPException(status_code=400, detail="Selected clinic not found or is inactive.")

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
    doctor_id = _allocate_doctor(admin, body.city, body.state, clinic_id=body.clinic_id)

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
            "p_clinic_id": body.clinic_id,
            "p_is_active": False,
            "p_medical_history": body.medical_history,
            "p_emergency_contact": body.emergency_contact,
            "p_doctor_id": doctor_id,
            "p_approval_status": "pending",
        }).execute()
    except Exception as e:
        try:
            admin.auth.admin.delete_user(user_id)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Profile creation failed: {e}")

    return success_response({
        "message": "Registration submitted. Your account is pending approval by your clinic receptionist.",
        "clinic_name": clinic[0]["clinic_name"],
    }, "Registration successful — pending approval", status_code=201)


def _get_full_profile(admin, user_id: str) -> Optional[dict]:
    profile = _row(admin, "profiles", "id", user_id)
    if not profile:
        return None
    table_map = {
        "doctor": "doctors",
        "patient": "patients",
        "receptionist": "receptionists",
        "clinical_assistant": "clinical_assistants",
        "admin": "admins",
    }
    role = profile.get("role")
    extra = _row(admin, table_map[role], "id", user_id) if role in table_map else {}
    return {**profile, **(extra or {})}


@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest):
    """Authenticate with email/password and return tokens + user profile."""
    settings = get_settings()
    try:
        fresh = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        sign_in = fresh.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
        session = sign_in.session
        user_id = sign_in.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    admin = get_supabase_admin()
    profile = _get_full_profile(admin, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="PROFILE_NOT_FOUND")

    if not profile.get("is_active"):
        if profile.get("role") == "patient":
            approval = profile.get("approval_status", "pending")
            if approval == "pending":
                raise HTTPException(status_code=403, detail="ACCOUNT_PENDING_APPROVAL")
            elif approval == "rejected":
                raise HTTPException(status_code=403, detail="ACCOUNT_REJECTED")
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact your clinic admin.")

    return success_response({
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_in": session.expires_in,
        "user": profile,
    }, "Login successful")


@router.get("/login")
@limiter.limit("60/minute")
async def get_me(request: Request, current_user: dict = Depends(get_current_user)):
    """Get current authenticated user's full profile."""
    if not current_user.get("role"):
        raise HTTPException(status_code=404, detail="PROFILE_NOT_FOUND")

    admin = get_supabase_admin()
    profile = _get_full_profile(admin, current_user["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="PROFILE_NOT_FOUND")

    return success_response(profile)


@router.post("/sync-profile")
@limiter.limit("10/minute")
async def sync_profile(
    request: Request,
    body: RegistrationSyncRequest,
    current_user: dict = Depends(get_current_user),
):
    """Legacy sync endpoint — kept for backward compatibility."""
    if body.role not in PUBLIC_REGISTER_ROLES:
        raise HTTPException(status_code=400, detail="Only patient profiles can be synced via this endpoint.")
    admin = get_supabase_admin()
    admin.table("profiles").upsert({
        "id": current_user["id"],
        "role": body.role,
        "full_name": body.full_name,
        "email": body.email,
        "phone": body.phone,
        "city": body.city,
        "state": body.state,
        "country": body.country,
        "is_active": False,
    }).execute()
    admin.table("patients").upsert({
        "id": current_user["id"],
        "medical_history": body.medical_history,
        "emergency_contact": body.emergency_contact,
        "approval_status": "pending",
    }).execute()
    return success_response({"role": body.role, "id": current_user["id"]}, "Profile synced")
