from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database import get_supabase_admin

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Validate token by calling Supabase's own /auth/v1/user endpoint.
    This works for ALL token types (HS256, ES256) without any key setup.
    """
    token = credentials.credentials
    admin = get_supabase_admin()

    # Let Supabase validate the token
    try:
        user_data = admin.auth.get_user(token)
        supabase_user = user_data.user
        if not supabase_user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = supabase_user.id
    email = supabase_user.email or ""

    # Look up profile row
    try:
        result = admin.table("profiles").select(
            "id, role, full_name, email, is_active"
        ).eq("id", user_id).single().execute()
    except Exception:
        # DB error — return minimal user without profile
        return {"id": user_id, "email": email, "role": None, "full_name": None}

    if not result.data:
        # Token valid but profile not created yet
        return {"id": user_id, "email": email, "role": None, "full_name": None}

    profile = result.data
    if not profile.get("is_active"):
        raise HTTPException(status_code=403, detail="Account is deactivated")

    return {
        "id": user_id,
        "email": profile["email"],
        "role": profile["role"],
        "full_name": profile["full_name"],
    }


def require_role(allowed_roles: list):
    async def role_checker(current_user: dict = Depends(get_current_user)):
        if not current_user.get("role") or current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required roles: {allowed_roles}",
            )
        return current_user
    return role_checker


require_doctor = require_role(["doctor", "admin"])
require_patient = require_role(["patient"])
require_admin = require_role(["admin"])
require_clinical_assistant = require_role(["clinical_assistant", "admin"])
require_receptionist = require_role(["receptionist", "admin"])
require_staff = require_role(["doctor", "clinical_assistant", "receptionist", "admin"])
