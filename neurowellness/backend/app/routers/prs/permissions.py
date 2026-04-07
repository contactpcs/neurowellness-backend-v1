from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from app.dependencies import get_current_user, require_doctor, require_staff
from app.database import get_supabase_admin
from app.utils.responses import success_response
from app.utils.exceptions import ForbiddenError, NotFoundError, BadRequestError

router = APIRouter()


class GrantPermissionRequest(BaseModel):
    patient_id: str
    disease_id: str        # TEXT PK e.g. "DEPRESSION/ANXIETY/2026"
    notes: Optional[str] = None


def _get_or_create_session(admin, patient_id: str, doctor_id: str) -> str:
    """Return an active session_id for this patient-doctor pair, creating one if needed."""
    existing = admin.table("sessions").select("id").eq(
        "patient_id", patient_id
    ).eq("doctor_id", doctor_id).in_(
        "status", ["scheduled", "in_progress"]
    ).order("session_date", desc=True).limit(1).execute().data

    if existing:
        return existing[0]["id"]

    result = admin.table("sessions").insert({
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "session_type": "in_person",
        "status": "in_progress",
    }).execute()
    return result.data[0]["id"]


@router.post("/")
async def grant_permission(
    body: GrantPermissionRequest,
    current_user: dict = Depends(require_staff),
):
    admin = get_supabase_admin()
    role = current_user["role"]
    doctor_id = current_user["id"]

    if role == "receptionist":
        raise ForbiddenError("Receptionists cannot grant assessments")

    # Verify patient exists
    patient = admin.table("patients").select("assigned_doctor_id").eq(
        "id", body.patient_id
    ).single().execute().data
    if not patient:
        raise ForbiddenError("Patient not found")

    # Verify disease exists
    disease = admin.table("prs_diseases").select("disease_id, disease_name").eq(
        "disease_id", body.disease_id
    ).single().execute().data
    if not disease:
        raise NotFoundError(f"Disease '{body.disease_id}' not found")

    # Load all scales for this disease in display order
    ds_maps = admin.table("prs_disease_scale_map").select(
        "scale_id, display_order"
    ).eq("disease_id", body.disease_id).order("display_order").execute().data
    if not ds_maps:
        raise BadRequestError(f"No scales found for disease '{body.disease_id}'")

    # Auto-create or reuse session
    session_id = _get_or_create_session(admin, body.patient_id, doctor_id)

    # Bulk-upsert one permission per scale
    perm_rows = [
        {
            "patient_id": body.patient_id,
            "doctor_id": doctor_id,
            "scale_id": ds["scale_id"],
            "disease_id": body.disease_id,
            "session_id": session_id,
            "status": "granted",
            "notes": body.notes,
        }
        for ds in ds_maps
    ]
    result = admin.table("assessment_permissions").upsert(
        perm_rows, on_conflict="patient_id,scale_id,session_id"
    ).execute()

    # Single notification for the entire disease assessment
    admin.table("notifications").insert({
        "user_id": body.patient_id,
        "type": "permission_granted",
        "title": "New Assessment Available",
        "body": (
            f"Dr. {current_user['full_name']} has assigned you the "
            f"{disease['disease_name']} assessment ({len(ds_maps)} scales)."
        ),
        "metadata": {
            "disease_id": body.disease_id,
            "session_id": session_id,
            "scales_count": len(ds_maps),
        },
    }).execute()

    return success_response({
        "disease_id": body.disease_id,
        "disease_name": disease["disease_name"],
        "session_id": session_id,
        "scales_granted": len(ds_maps),
        "permissions": result.data,
    }, f"Granted {len(ds_maps)} scales for {disease['disease_name']}")


@router.get("/patient/{patient_id}")
async def get_patient_permissions(patient_id: str, current_user: dict = Depends(require_staff)):
    admin = get_supabase_admin()
    perms = admin.table("assessment_permissions").select(
        "*, prs_scales(scale_id, scale_code, scale_name), prs_diseases(disease_id, disease_name)"
    ).eq("patient_id", patient_id).eq("doctor_id", current_user["id"]).order("granted_at", desc=True).execute().data
    return success_response(perms)


@router.get("/my")
async def get_my_permissions(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    perms = admin.table("assessment_permissions").select(
        "*, prs_scales(scale_id, scale_code, scale_name), prs_diseases(disease_id, disease_name)"
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
