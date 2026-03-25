from app.database import get_supabase_admin


def send_notification(user_id: str, notif_type: str, title: str, body: str, data: dict = None):
    admin = get_supabase_admin()
    admin.table("notifications").insert({
        "user_id": user_id,
        "type": notif_type,
        "title": title,
        "body": body,
        "data": data or {},
    }).execute()
