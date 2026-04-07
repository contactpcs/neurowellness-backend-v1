from fastapi import APIRouter, Depends, Query
from typing import Optional
from pydantic import BaseModel
from app.dependencies import require_doctor, require_staff
from app.database import get_supabase_admin
from app.utils.responses import success_response, paginated_response
from app.utils.exceptions import ForbiddenError, NotFoundError, BadRequestError
from app.routers.prs.permissions import _get_or_create_session

router = APIRouter()


@router.get("/dashboard")
async def doctor_dashboard(current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    doctor_id = current_user["id"]

    profile = admin.table("profiles").select("*").eq("id", doctor_id).single().execute().data
    doctor = admin.table("doctors").select("*").eq("id", doctor_id).single().execute().data

    patients = admin.table("patients").select("id").eq("assigned_doctor_id", doctor_id).execute().data
    total_patients = len(patients)
    patient_ids = [p["id"] for p in patients]

    pending = 0
    if patient_ids:
        perm_res = admin.table("assessment_permissions").select("id").in_(
            "patient_id", patient_ids
        ).eq("status", "granted").execute()
        pending = len(perm_res.data)

    recent = []
    if patient_ids:
        # Get recent completed instances
        instances = admin.table("prs_assessment_instances").select("instance_id").in_(
            "patient_id", patient_ids
        ).eq("status", "completed").order("completed_at", desc=True).limit(5).execute().data
        instance_ids = [i["instance_id"] for i in instances]
        if instance_ids:
            recent = admin.table("prs_final_results").select(
                "calculated_value, max_possible, overall_severity_label, time_stamp"
            ).in_("instance_id", instance_ids).order("time_stamp", desc=True).limit(5).execute().data

    return success_response({
        "profile": {**(profile or {}), **(doctor or {})},
        "patients_summary": {
            "total": total_patients,
            "pending_assessments": pending,
        },
        "recent_completed_assessments": recent,
    })


@router.get("/patients")
async def list_patients(
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_doctor),
):
    admin = get_supabase_admin()
    query = admin.table("patients").select(
        "id, assigned_doctor_id, created_at, "
        "profiles(id, full_name, avatar_url, role, created_at)"
    )
    result = query.range(skip, skip + limit - 1).execute()
    data = result.data

    if search:
        search_lower = search.lower()
        data = [
            p for p in data
            if search_lower in (p.get("profiles") or {}).get("full_name", "").lower()
        ]

    return paginated_response(data, len(data), skip, limit)


@router.get("/patients/{patient_id}")
async def get_patient_detail(patient_id: str, current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    patient = admin.table("patients").select("*").eq("id", patient_id).single().execute().data
    if not patient:
        raise ForbiddenError("Patient not found")

    profile = admin.table("profiles").select("*").eq("id", patient_id).single().execute().data
    permissions = admin.table("assessment_permissions").select(
        "*, prs_scales(scale_code, scale_name)"
    ).eq("patient_id", patient_id).order("granted_at", desc=True).execute().data

    # Get score summaries via final results
    instances = admin.table("prs_assessment_instances").select("instance_id").eq(
        "patient_id", patient_id
    ).execute().data
    instance_ids = [i["instance_id"] for i in instances]
    scores_summary = []
    if instance_ids:
        scores_summary = admin.table("prs_final_results").select(
            "calculated_value, max_possible, overall_severity, overall_severity_label, time_stamp"
        ).in_("instance_id", instance_ids).order("time_stamp", desc=True).limit(10).execute().data

    recent_instances = admin.table("prs_assessment_instances").select("*").eq(
        "patient_id", patient_id
    ).order("started_at", desc=True).limit(5).execute().data

    return success_response({
        "patient": {**(patient or {}), **(profile or {})},
        "permissions": permissions,
        "scores_summary": scores_summary,
        "recent_instances": recent_instances,
    })


class GrantAssessmentRequest(BaseModel):
    disease_id: str        # TEXT PK e.g. "DEPRESSION/ANXIETY/2026"
    notes: Optional[str] = None


@router.post("/patients/{patient_id}/grant-assessment")
async def grant_assessment(
    patient_id: str,
    body: GrantAssessmentRequest,
    current_user: dict = Depends(require_staff),
):
    admin = get_supabase_admin()
    role = current_user["role"]
    doctor_id = current_user["id"]

    if role == "receptionist":
        raise ForbiddenError("Receptionists cannot grant assessments")

    patient = admin.table("patients").select("id, assigned_doctor_id").eq("id", patient_id).single().execute().data
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
    session_id = _get_or_create_session(admin, patient_id, doctor_id)

    # Bulk-upsert one permission per scale
    perm_rows = [
        {
            "patient_id": patient_id,
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

    admin.table("notifications").insert({
        "user_id": patient_id,
        "type": "permission_granted",
        "title": "New Assessment Assigned",
        "body": (
            f"Dr. {current_user['full_name']} assigned you the "
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
    }, f"Granted {len(ds_maps)} scales for {disease['disease_name']}")


class AvailabilityUpdate(BaseModel):
    availability: str


@router.put("/availability")
async def update_availability(body: AvailabilityUpdate, current_user: dict = Depends(require_doctor)):
    admin = get_supabase_admin()
    result = admin.table("doctors").update({"availability": body.availability}).eq("id", current_user["id"]).execute()
    return success_response(result.data[0] if result.data else {}, "Availability updated")
