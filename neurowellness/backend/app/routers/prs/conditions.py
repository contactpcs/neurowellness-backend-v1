from fastapi import APIRouter, Depends
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response
from app.utils.exceptions import NotFoundError

router = APIRouter()


@router.get("/")
async def list_conditions(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    diseases = admin.table("prs_diseases").select("*").eq("status", True).execute().data
    return success_response(diseases)


@router.get("/{disease_id}")
async def get_condition(disease_id: str, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    disease = admin.table("prs_diseases").select("*").eq("disease_id", disease_id).single().execute().data
    if not disease:
        raise NotFoundError("Disease not found")
    # Load scales through disease_scale_map
    ds_maps = admin.table("prs_disease_scale_map").select(
        "ds_map_id, scale_id, display_order"
    ).eq("disease_id", disease_id).order("display_order").execute().data
    scales = []
    for ds in ds_maps:
        s = admin.table("prs_scales").select(
            "scale_id, scale_code, scale_name"
        ).eq("scale_id", ds["scale_id"]).execute().data
        if s:
            scales.append({**s[0], "display_order": ds["display_order"]})
    return success_response({**disease, "scales": scales})
