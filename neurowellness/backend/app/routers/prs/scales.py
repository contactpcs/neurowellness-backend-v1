from fastapi import APIRouter, Depends, Query
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response, paginated_response
from app.utils.exceptions import NotFoundError

router = APIRouter()


@router.get("/")
async def list_scales(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    admin = get_supabase_admin()
    result = admin.table("prs_scales").select(
        "id, scale_code, name, short_name, description, scoring_method, max_score, severity_bands, is_active"
    ).eq("is_active", True).range(skip, skip + limit - 1).execute()
    total = len(result.data)
    return paginated_response(result.data, total, skip, limit)


@router.get("/by-code/{code}")
async def get_scale_by_code(code: str, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    scale = admin.table("prs_scales").select("*").eq("scale_code", code).single().execute().data
    if not scale:
        raise NotFoundError(f"Scale '{code}' not found")
    questions = admin.table("prs_questions").select("*").eq("scale_id", scale["id"]).order("question_index").execute().data
    return success_response({**scale, "questions": questions})


@router.get("/{scale_id}")
async def get_scale(scale_id: str, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    scale = admin.table("prs_scales").select("*").eq("id", scale_id).single().execute().data
    if not scale:
        raise NotFoundError("Scale not found")
    questions = admin.table("prs_questions").select("*").eq("scale_id", scale_id).order("question_index").execute().data
    return success_response({**scale, "questions": questions})
