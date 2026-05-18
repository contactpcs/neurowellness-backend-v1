from fastapi import APIRouter, Request, HTTPException

from app.database import get_supabase_admin
from app.models.consent import ConsentSubmitRequest
from app.utils.responses import success_response
from app.limiter import limiter

router = APIRouter()


@router.get("/forms")
@limiter.limit("60/minute")
async def get_consent_forms(request: Request):
    """Public — returns all consent forms. Call on page load before rendering checkboxes."""
    admin = get_supabase_admin()
    forms = admin.table("consent_forms").select(
        "consent_form_id, consent_form_name, is_required, created_at"
    ).order("created_at", desc=False).execute().data or []
    return success_response(forms, "Consent forms retrieved.")


@router.post("/responses", status_code=201)
@limiter.limit("10/minute")
async def submit_consent_responses(request: Request, body: ConsentSubmitRequest):
    """
    Public — submit consent responses for any user after registration.
    Validates user exists, all required forms are present and accepted, then batch-inserts.
    """
    admin = get_supabase_admin()

    # Verify user exists (any role)
    profile = admin.table("profiles").select("id").eq(
        "id", body.user_id
    ).limit(1).execute().data
    if not profile:
        raise HTTPException(status_code=404, detail="User not found.")

    # Load all forms for name lookup and required-form validation
    all_forms = admin.table("consent_forms").select(
        "consent_form_id, consent_form_name, is_required"
    ).execute().data or []

    form_map = {f["consent_form_id"]: f for f in all_forms}
    required_forms = [f for f in all_forms if f["is_required"]]
    submitted_map = {r.consent_form_id: r.response for r in body.responses}

    # All submitted form IDs must exist
    for r in body.responses:
        if r.consent_form_id not in form_map:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown consent form ID: {r.consent_form_id}",
            )

    # All required forms must be submitted and accepted
    for f in required_forms:
        fid = f["consent_form_id"]
        if fid not in submitted_map:
            raise HTTPException(
                status_code=400,
                detail=f"Required consent form '{f['consent_form_name']}' not submitted.",
            )
        if not submitted_map[fid]:
            raise HTTPException(
                status_code=400,
                detail=f"Required consent form '{f['consent_form_name']}' must be accepted.",
            )

    # Block duplicate submissions
    existing = admin.table("user_consent_responses").select("consent_form_id").eq(
        "user_id", body.user_id
    ).execute().data or []
    existing_ids = {r["consent_form_id"] for r in existing}
    duplicates = [r.consent_form_id for r in body.responses if r.consent_form_id in existing_ids]
    if duplicates:
        raise HTTPException(
            status_code=409,
            detail=f"Consent already submitted for form(s): {', '.join(duplicates)}",
        )

    rows = [
        {
            "user_id": body.user_id,
            "consent_form_id": r.consent_form_id,
            "consent_form_name": form_map[r.consent_form_id]["consent_form_name"],
            "response": r.response,
        }
        for r in body.responses
    ]

    try:
        result = admin.table("user_consent_responses").insert(rows).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save consent responses: {e}")

    saved = [
        {
            "consent_response_id": row.get("consent_response_id"),
            "consent_form_name": row.get("consent_form_name"),
        }
        for row in (result.data or [])
    ]

    return success_response({"saved": saved}, "Consent responses recorded successfully.")
