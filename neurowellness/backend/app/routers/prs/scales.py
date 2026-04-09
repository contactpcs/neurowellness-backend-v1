from fastapi import APIRouter, Depends, Query, Request
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response, paginated_response
from app.utils.exceptions import NotFoundError
from app.limiter import limiter

router = APIRouter()


@router.get("/")
@limiter.limit("60/minute")
async def list_scales(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    admin = get_supabase_admin()
    result = admin.table("prs_scales").select(
        "scale_id, scale_code, scale_name, is_common_scale, num_diseases_used"
    ).range(skip, skip + limit - 1).execute()
    return paginated_response(result.data or [], len(result.data or []), skip, limit)


@router.get("/by-code/{code}")
@limiter.limit("60/minute")
async def get_scale_by_code(request: Request, code: str, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    result = admin.table("prs_scales").select("*").eq("scale_code", code).limit(1).execute()
    if not result.data:
        raise NotFoundError(f"Scale '{code}' not found")
    scale = result.data[0]
    questions = admin.table("prs_questions").select("*").eq(
        "scale_id", scale["scale_id"]
    ).order("display_order").execute().data or []
    return success_response({**scale, "questions": questions})


@router.get("/{scale_id}")
@limiter.limit("60/minute")
async def get_scale(request: Request, scale_id: str, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    result = admin.table("prs_scales").select("*").eq("scale_id", scale_id).limit(1).execute()
    if not result.data:
        raise NotFoundError("Scale not found")
    scale = result.data[0]
    questions = admin.table("prs_questions").select("*").eq(
        "scale_id", scale_id
    ).order("display_order").execute().data or []
    return success_response({**scale, "questions": questions})
