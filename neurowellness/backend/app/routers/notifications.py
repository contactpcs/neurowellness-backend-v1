from fastapi import APIRouter, Depends
from app.dependencies import get_current_user
from app.database import get_supabase_admin
from app.utils.responses import success_response

router = APIRouter()


@router.get("/")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    result = admin.table("notifications").select("*").eq(
        "user_id", current_user["id"]
    ).order("created_at", desc=True).limit(20).execute()
    return success_response(result.data)


@router.put("/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    admin.table("notifications").update({"is_read": True}).eq(
        "user_id", current_user["id"]
    ).eq("is_read", False).execute()
    return success_response({}, "All notifications marked as read")


@router.put("/{notification_id}/read")
async def mark_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    result = admin.table("notifications").update({"is_read": True}).eq(
        "id", notification_id
    ).eq("user_id", current_user["id"]).execute()
    return success_response(result.data[0] if result.data else {})
