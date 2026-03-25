from fastapi import APIRouter, Depends
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response
from app.utils.exceptions import NotFoundError

router = APIRouter()


@router.get("/")
async def list_conditions(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    conditions = admin.table("prs_conditions").select("*").eq("is_active", True).execute().data
    return success_response(conditions)


@router.get("/{condition_id}")
async def get_condition(condition_id: str, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    condition = admin.table("prs_conditions").select("*").eq("condition_id", condition_id).single().execute().data
    if not condition:
        raise NotFoundError("Condition not found")
    scales = []
    for scale_code in condition.get("scale_ids", []):
        s = admin.table("prs_scales").select(
            "id, scale_id, name, short_name, description, max_score"
        ).eq("scale_id", scale_code).eq("is_active", True).execute().data
        if s:
            scales.append(s[0])
    return success_response({**condition, "scales": scales})
