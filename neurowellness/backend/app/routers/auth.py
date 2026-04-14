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


def _row(admin, table: str, field: str, value: str) -> Optional[dict]:
    """Fetch a single row by field=value without raising on no result."""
    result = admin.table(table).select("*").eq(field, value).limit(1).execute()
    return result.data[0] if result.data else None


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
        return [r for r in rows if (r.get("current_patient_count") or 0) < (r.get("max_patients") or 50)]

    def pick_least_loaded(doctors: list) -> Optional[str]:
        if not doctors:
            return None
        return min(doctors, key=lambda d: d.get("current_patient_count") or 0)["id"]

    if city:
        city_doctors = admin.table("profiles").select("id").eq("role", "doctor").eq(
            "city", city
        ).execute().data or []
        city_ids = {r["id"] for r in city_doctors}
        if city_ids:
            candidates = [d for d in query_doctors({}) if d["id"] in city_ids]
            result = pick_least_loaded(candidates)
            if result:
                return result

    if state:
        state_doctors = admin.table("profiles").select("id").eq("role", "doctor").eq(
            "state", state
        ).execute().data or []
        state_ids = {r["id"] for r in state_doctors}
        if state_ids:
            candidates = [d for d in query_doctors({}) if d["id"] in state_ids]
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


class RegisterRequest(RegistrationSyncRequest):
    password: str


VALID_ROLES = {"doctor", "patient", "admin", "receptionist", "clinical_assistant"}


@router.post("/register")
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest):
    """
    Create a new confirmed user via admin API and immediately create their profile.
    Returns Supabase session tokens — no email confirmation required.
    """
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {sorted(VALID_ROLES)}")

    admin = get_supabase_admin()

    # Create user (email_confirm=True skips verification email)
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

    try:
        _create_profile_rows(admin, user_id, body)
    except Exception as e:
        # Roll back the auth user so the email isn't stuck
        try:
            admin.auth.admin.delete_user(user_id)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Profile creation failed: {e}")

    # Sign in using a FRESH client (never the cached admin client — calling
    # sign_in_with_password on the shared admin client overwrites its service-role
    # session, causing every subsequent admin.auth.admin.create_user() to fail).
    settings = get_settings()
    try:
        fresh = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        sign_in = fresh.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
        session = sign_in.session
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"User created but login failed: {e}")

    profile = _get_full_profile(admin, user_id) or {"id": user_id, "role": body.role}

    return success_response({
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_in": session.expires_in,
        "user": profile,
    }, "Registration successful")


def _create_profile_rows(admin, user_id: str, body: RegistrationSyncRequest):
    """Create profiles row and role-specific extension row."""
    admin.table("profiles").upsert({
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
    }).execute()

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
        # Auto-allocate to the best available doctor
        doctor_id = _allocate_doctor(admin, body.city, body.state)
        if doctor_id:
            admin.table("patients").update({
                "assigned_doctor_id": doctor_id,
            }).eq("id", user_id).execute()
            # Increment doctor's patient count
            existing = admin.table("doctors").select("current_patient_count").eq(
                "id", doctor_id
            ).limit(1).execute()
            if existing.data:
                count = (existing.data[0].get("current_patient_count") or 0) + 1
                admin.table("doctors").update(
                    {"current_patient_count": count}
                ).eq("id", doctor_id).execute()

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


@router.post("/sync-profile")
@limiter.limit("10/minute")
async def sync_profile(
    request: Request,
    body: RegistrationSyncRequest,
    current_user: dict = Depends(get_current_user),
):
    """Called from frontend after Supabase auth.signUp to create DB profile."""
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {sorted(VALID_ROLES)}")

    admin = get_supabase_admin()
    _create_profile_rows(admin, current_user["id"], body)
    return success_response({"role": body.role, "id": current_user["id"]}, "Profile synced successfully")


def _get_full_profile(admin, user_id: str) -> Optional[dict]:
    """Fetch profile + role-specific extension row, merged into one dict."""
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
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    admin = get_supabase_admin()
    profile = _get_full_profile(admin, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="PROFILE_NOT_FOUND")

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
