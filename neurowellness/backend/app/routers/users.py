from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response
from app.limiter import limiter

router = APIRouter()


def _row(admin, table: str, field: str, value: str):
    """Fetch a single row by field=value without raising on no result."""
    result = admin.table(table).select("*").eq(field, value).limit(1).execute()
    return result.data[0] if result.data else None


def _get_full_profile(admin, user_id: str):
    """
    Fetch profile + role-specific extension row + clinic, merged into one dict.

    Powers profile pages for every role (doctor/patient/receptionist/clinical_assistant/admin).
    Clinic info is nested under `clinic` so the frontend can render it without
    colliding with role-table fields like `clinic_id` that already exist on the row.
    """
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
    merged = {**profile, **(extra or {})}

    clinic_id = merged.get("clinic_id")
    if clinic_id:
        clinic = _row(admin, "clinics", "clinic_id", clinic_id) or _row(admin, "clinics", "id", clinic_id)
        if clinic:
            merged["clinic"] = clinic

    return merged


class UpdateProfileRequest(BaseModel):
    # Fields stored in profiles table (editable by all roles)
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    address_line1: Optional[str] = None
    pincode: Optional[str] = None
    language_pref: Optional[str] = None
    # Fields stored in patients table (patient role only)
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    emergency_contact: Optional[str] = None
    occupation: Optional[str] = None
    marital_status: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_policy: Optional[str] = None


@router.put("/me")
@limiter.limit("20/minute")
async def update_my_profile(
    request: Request,
    body: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update the current user's own editable profile fields."""
    admin = get_supabase_admin()
    user_id = current_user["id"]
    role = current_user["role"]

    profile_fields = ["phone", "city", "state", "country", "address_line1", "pincode", "language_pref"]
    profile_updates = {f: getattr(body, f) for f in profile_fields if getattr(body, f) is not None}
    if profile_updates:
        admin.table("profiles").update(profile_updates).eq("id", user_id).execute()

    if role == "patient":
        patient_fields = ["blood_group", "allergies", "emergency_contact", "occupation",
                          "marital_status", "insurance_provider", "insurance_policy"]
        patient_updates = {f: getattr(body, f) for f in patient_fields if getattr(body, f) is not None}
        if patient_updates:
            admin.table("patients").update(patient_updates).eq("id", user_id).execute()

    return success_response({"id": user_id}, "Profile updated successfully")


@router.get("/profile")
@limiter.limit("60/minute")
async def get_profile(request: Request, current_user: dict = Depends(get_current_user)):
    """Get current authenticated user's full profile (legacy alias for /users/me)."""
    return await get_me(request, current_user)


@router.get("/me")
@limiter.limit("60/minute")
async def get_me(request: Request, current_user: dict = Depends(get_current_user)):
    """
    Get current authenticated user's full profile, including role-specific
    fields and the user's clinic. This is the canonical endpoint for profile
    pages across all roles.
    """
    if not current_user.get("role"):
        raise HTTPException(status_code=404, detail="PROFILE_NOT_FOUND")

    admin = get_supabase_admin()
    profile = _get_full_profile(admin, current_user["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="PROFILE_NOT_FOUND")

    return success_response(profile)
