from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from app.dependencies import get_current_user, require_doctor
from app.database import get_supabase_admin
from app.utils.responses import success_response
from app.utils.exceptions import ForbiddenError

router = APIRouter()


class GrantPermissionRequest(BaseModel):
    patient_id: str
    scale_id: str
    session_id: Optional[str] = None
    notes: Optional[str] = None


@router.post("/")
async def grant_permission(
    body: GrantPermissionRequest,
    current_user: dict = Depends(require_doctor),
):
    admin = get_supabase_admin()
    patient = admin.table("patients").select("assigned_doctor_id").eq("id", body.patient_id).single().execute().data
    if not patient or patient["assigned_doctor_id"] != current_user["id"]:
        raise ForbiddenError("Patient is not assigned to you")

    perm = {
        "patient_id": body.patient_id,
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
        "user_id": body.patient_id,
        "type": "permission_granted",
        "title": "New Assessment Available",
        "body": f"Dr. {current_user['full_name']} has assigned you the {scale['name'] if scale else 'assessment'}.",
        "data": {"scale_id": body.scale_id, "permission_id": result.data[0]["id"]},
    }).execute()

    return success_response(result.data[0], "Permission granted")


@router.get("/patient/{patient_id}")
async def get_patient_permissions(patient_id: str, current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    perms = admin.table("assessment_permissions").select(
        "*, prs_scales(id, scale_id, name, short_name)"
    ).eq("patient_id", patient_id).eq("doctor_id", current_user["id"]).order("granted_at", desc=True).execute().data
    return success_response(perms)


@router.get("/my")
async def get_my_permissions(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    perms = admin.table("assessment_permissions").select(
        "*, prs_scales(id, scale_id, name, short_name, description)"
    ).eq("patient_id", current_user["id"]).eq("status", "granted").execute().data
    return success_response(perms)


@router.put("/{permission_id}/revoke")
async def revoke_permission(permission_id: str, current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    result = admin.table("assessment_permissions").update({
        "status": "revoked",
        "revoked_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", permission_id).eq("doctor_id", current_user["id"]).execute()
    return success_response(result.data[0] if result.data else {}, "Permission revoked")
