from fastapi import APIRouter, Depends, HTTPException, Request
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


@router.get("/profile")
@limiter.limit("60/minute")
async def get_profile(request: Request, current_user: dict = Depends(get_current_user)):
    """Get current authenticated user's full profile."""
    if not current_user.get("role"):
        raise HTTPException(status_code=404, detail="PROFILE_NOT_FOUND")

    admin = get_supabase_admin()
    profile = _get_full_profile(admin, current_user["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="PROFILE_NOT_FOUND")

    return success_response(profile)
