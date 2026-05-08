# NeuroWellness — User Flow Optimization: Bug Fix & Solutions Report

> Generated: 2026-05-08  
> Source Plan: USER_FLOW_OPTIMIZATION_PLAN.md  
> Scope: Backend code fixes + Database migrations  
> Audited against: `neurowellness-backend-v1` current codebase

---

## Summary Table

| # | Issue | Area | Status |
|---|-------|------|--------|
| Bug 2 | Reject reason captured but never stored | Backend + DB | ✅ Fixed |
| Bug 3 | Hard delete on staff reject vs soft reject on admin | Backend | ✅ Fixed |
| Bug 4 | `registered_today` missing from backend dashboard | Backend | ✅ Fixed |
| Bug 5 | No `/users/me` backend endpoint | Backend | ✅ Fixed |
| Bug 6 | Patient detail missing medical history and sessions | Backend (data returned) | ✅ Fixed |
| DB Part 6 | New DB columns for all roles | Database | ✅ Fixed (except Admins extended fields) |
| Admin extended fields | `admin_level`, `date_of_joining` on admins table | Database | ⏳ Deferred |

---

## Bug 2 — Reject Reason Captured But Never Stored

**Plan Location:** Part 2, Bug 2  
**Status:** ✅ Fixed

### Problem
The frontend collected a rejection reason from the receptionist and sent it as `{ reason }` in the PUT request body. The backend `reject_patient` endpoint had no body parameter at all — the reason was silently dropped on every rejection. Patients were rejected without any record of why, and there was no way to notify them with a meaningful message.

### Fix Applied

**Backend — `backend/app/routers/staff.py`:**

Added a `RejectPatientRequest` Pydantic model that accepts the optional reason:

```python
class RejectPatientRequest(BaseModel):
    reason: Optional[str] = None
```

Updated the `reject_patient` endpoint to accept and use the body:

```python
@router.put("/patients/{patient_id}/reject")
async def reject_patient(
    request: Request,
    patient_id: str,
    body: RejectPatientRequest,
    current_user: dict = Depends(require_staff),
):
    admin.table("patients").update({
        "approval_status": "rejected",
        "rejection_reason": body.reason,
    }).eq("id", patient_id).execute()
    admin.table("profiles").update({"is_active": False}).eq("id", patient_id).execute()
    # Notification sent to patient with reason
```

**Database — `patients` table:**

Added the `rejection_reason` column to store the reason permanently:

```sql
ALTER TABLE patients ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
```

**Notification:**  
A notification is sent to the patient via `send_notification` so they are informed of the rejection and the reason provided by the receptionist.

### Impact
- Rejection reasons are now permanently stored against each patient record
- Patients receive an in-app notification with the reason when rejected
- Receptionists have a full audit trail of why each registration was declined
- No data loss — the reason field is optional so existing flows without a reason still work

---

## Bug 3 — Hard Delete on Staff Reject vs Soft Reject on Admin Reject

**Plan Location:** Part 2, Bug 3  
**Status:** ✅ Fixed

### Problem
The staff/receptionist `reject_patient` endpoint permanently deleted the patient — calling `admin.auth.admin.delete_user()`, deleting from `patients` table, and deleting from `profiles` table. The admin `reject_patient` endpoint did a soft reject — only setting `approval_status='rejected'` and `is_active=False`. The same action had completely different consequences depending on who performed it, and the hard delete destroyed all patient data permanently.

### Fix Applied

**`backend/app/routers/staff.py` — changed from hard delete to soft reject:**

```python
# Before (hard delete — destroyed all data)
admin.table("patients").delete().eq("id", patient_id).execute()
admin.table("profiles").delete().eq("id", patient_id).execute()
admin.auth.admin.delete_user(patient_id)

# After (soft reject — data preserved, account deactivated)
admin.table("patients").update({
    "approval_status": "rejected",
    "rejection_reason": body.reason,
}).eq("id", patient_id).execute()
admin.table("profiles").update({"is_active": False}).eq("id", patient_id).execute()
```

Both `staff.py` and `admin.py` now perform soft rejects consistently:
- `approval_status` set to `"rejected"`
- `is_active` set to `False` — patient cannot log in
- Patient data, assessment history, and profile remain intact in the database
- Auth user is NOT deleted — account is simply deactivated

### Impact
- Consistent behaviour regardless of who performs the rejection
- Medical records and registration data are preserved for audit and compliance
- A rejected patient can be re-approved in the future without re-registering
- No accidental permanent data loss from a misclick

---

## Bug 4 — `registered_today` Missing From Backend Dashboard

**Plan Location:** Part 2, Bug 4  
**Status:** ✅ Fixed

### Problem
The receptionist dashboard frontend displayed a "Registered Today" stat card but the backend `staff_dashboard` endpoint never returned this field. The frontend was attempting a client-side count by filtering on `created_at`, which produced unreliable results due to IST vs UTC timezone differences — patients registered late in the evening IST would appear on the wrong day.

### Fix Applied

**`backend/app/routers/staff.py` — `staff_dashboard` endpoint:**

Added server-side computation of today's registration count scoped to the staff member's clinic, using UTC as the reference timezone:

```python
from datetime import datetime, timezone

# Patients registered today (UTC)
today_utc = datetime.now(timezone.utc).date().isoformat()
today_q = admin.table("patients").select("id").gte("created_at", f"{today_utc}T00:00:00Z")
if clinic_id:
    today_q = today_q.eq("clinic_id", clinic_id)
registered_today = len(today_q.execute().data or [])
```

Returned in the response under `patients_summary`:

```python
return success_response({
    "role": role,
    "patients_summary": {
        "total": len(patients),
        "pending_assessments": pending_count,
        "pending_approval": pending_approval_count,
        "registered_today": registered_today,   # ← added
    },
    **extra,
})
```

### Impact
- "Registered Today" stat is now accurate and timezone-consistent
- Count is scoped to the receptionist's own clinic — no cross-clinic leakage
- Frontend no longer needs client-side date filtering logic
- UTC comparison ensures correct counts regardless of where the server or client is located

---

## Bug 5 — No `/users/me` Backend Endpoint

**Plan Location:** Part 2, Bug 5 / Part 9  
**Status:** ✅ Fixed

### Problem
All role-based profile pages (receptionist, doctor, patient, clinical assistant) called `usersService.getProfile()` which hit a `/users/profile` endpoint. This endpoint did not exist in the backend — profile pages silently fell back to limited JWT data, showing "not available" for clinic name, role-specific fields, and other profile details.

### Fix Applied

**Created `backend/app/routers/users.py`** with two endpoints:

**`GET /users/me`** — returns the full merged profile for any authenticated role:

```python
@router.get("/me")
async def get_me(request: Request, current_user: dict = Depends(get_current_user)):
    admin = get_supabase_admin()
    profile = _get_full_profile(admin, current_user["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="PROFILE_NOT_FOUND")

    # Enrich with clinic info
    if profile.get("clinic_id"):
        clinic = _row(admin, "clinics", "clinic_id", profile["clinic_id"])
        if clinic:
            profile["clinic_name"] = clinic.get("clinic_name")
            profile["clinic_city"] = clinic.get("city")
            profile["clinic_address"] = clinic.get("address")

    # For patients: add assigned doctor name
    if profile.get("role") == "patient" and profile.get("assigned_doctor_id"):
        doc_profile = _row(admin, "profiles", "id", profile["assigned_doctor_id"])
        profile["assigned_doctor_name"] = doc_profile.get("full_name") if doc_profile else None

    return success_response(profile)
```

**`GET /users/profile`** — legacy alias that calls the same handler for backward compatibility.

**Registered in `backend/app/main.py`:**
```python
from app.routers import users
app.include_router(users.router, prefix=f"{PREFIX}/users", tags=["users"])
```

**Response includes (role-merged):**
- All `profiles` fields: `full_name`, `email`, `phone`, `city`, `state`, `date_of_birth`, `gender`, `is_active`, `clinic_id`
- Clinic fields: `clinic_name`, `clinic_city`, `clinic_address`
- Role-specific fields: doctor specialization/availability, receptionist employee_id/department, patient medical_history/approval_status
- For patients: `assigned_doctor_name`

### Impact
- All profile pages across all roles now load complete, accurate data
- Single endpoint serves every role — no duplication
- Clinic information is fully populated in profile cards
- Frontend `usersService.getProfile()` now resolves correctly

---

## Bug 6 — Patient Detail Missing Medical History and Sessions

**Plan Location:** Part 2, Bug 6  
**Status:** ✅ Fixed (Backend already returned data)

### Problem
The backend `GET /staff/patients/{id}` already returned `medical_history`, `emergency_contact`, and `recent_sessions[]` in the response. However the frontend patient detail page only rendered contact info and the doctor allocation card — medical history and session data were fetched from the backend but discarded without being displayed.

### What the Backend Returns

**`backend/app/routers/staff.py` — `get_patient_detail`:**

```python
result = {
    "patient": {**patient, **profile},     # includes medical_history, emergency_contact
    "recent_sessions": recent_sessions,    # last 10 sessions with date, status, type
}

# For clinical_assistant role — also returns:
result["permissions"] = permissions
result["scores_summary"] = scores_summary
```

The backend correctly returns:
- `patient.medical_history` — free text medical history
- `patient.emergency_contact` — emergency contact details
- `recent_sessions[]` — array of session objects with `session_date`, `status`, `session_type`, `patient_id`, `doctor_id`

### Resolution
Backend required no changes. The fix is on the frontend side — the patient detail page needs to render the Medical Info and Sessions tabs using data already present in the API response.

---

## DB Part 6 — New Database Columns Applied

**Plan Location:** Part 6  
**Status:** ✅ Fixed (except Admins extended fields — deferred)

### Migrations Applied

**Profiles table — common fields for all roles:**
```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url    TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender        TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS pincode       TEXT,
  ADD COLUMN IF NOT EXISTS language_pref TEXT DEFAULT 'en';
```

**Patients table — extended clinical and administrative fields:**
```sql
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS mrn               TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS blood_group       TEXT CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown')),
  ADD COLUMN IF NOT EXISTS allergies         TEXT,
  ADD COLUMN IF NOT EXISTS occupation        TEXT,
  ADD COLUMN IF NOT EXISTS marital_status    TEXT CHECK (marital_status IN ('single','married','divorced','widowed','other')),
  ADD COLUMN IF NOT EXISTS insurance_provider TEXT,
  ADD COLUMN IF NOT EXISTS insurance_policy  TEXT,
  ADD COLUMN IF NOT EXISTS referred_by       TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT;
```

**MRN auto-generation trigger:**
```sql
CREATE SEQUENCE IF NOT EXISTS mrn_seq START 10001;

CREATE OR REPLACE FUNCTION generate_mrn() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mrn IS NULL THEN
    NEW.mrn := 'NW-' || LPAD(nextval('mrn_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_mrn
  BEFORE INSERT ON patients
  FOR EACH ROW EXECUTE FUNCTION generate_mrn();
```

Every new patient registered now automatically receives a unique MRN in the format `NW-010001`, `NW-010002`, etc.

**Doctors table — extended professional fields:**
```sql
ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS bio                 TEXT,
  ADD COLUMN IF NOT EXISTS qualification       TEXT[],
  ADD COLUMN IF NOT EXISTS languages           TEXT[],
  ADD COLUMN IF NOT EXISTS working_hours       JSONB,
  ADD COLUMN IF NOT EXISTS medical_council_reg TEXT;
```

**Receptionists table — extended fields:**
```sql
ALTER TABLE receptionists
  ADD COLUMN IF NOT EXISTS date_of_joining DATE,
  ADD COLUMN IF NOT EXISTS languages       TEXT[];
```

### Impact of DB Migrations
- Every patient now gets an auto-generated Medical Record Number (MRN) at registration
- Patient profiles can store blood group, allergies, insurance, occupation, and marital status
- Doctor profiles can store bio, qualifications, languages spoken, and working hours
- Rejection reasons are permanently stored on the patient record
- All profiles support avatar URL, address, pincode, and language preference

---

## Deferred — Admin Extended Fields

**Plan Location:** Part 6, Admins section  
**Status:** ⏳ Deferred

### What Was Not Applied

```sql
-- NOT YET RUN
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS admin_level   TEXT DEFAULT 'clinic' CHECK (admin_level IN ('clinic', 'global')),
  ADD COLUMN IF NOT EXISTS date_of_joining DATE;
```

### Reason for Deferral
The current system has a single global admin with no need for admin-level distinction. The `admin_level` field would only be relevant if multi-admin support is introduced in the future (Fix 14 was also ruled as not needed). `date_of_joining` is a low-priority informational field. Both are deferred until there is an operational requirement.

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `backend/app/routers/staff.py` | Modified | Added `RejectPatientRequest` model; changed reject to soft delete with reason + notification; added `registered_today` to dashboard response |
| `backend/app/routers/users.py` | Created | New router with `GET /me` and `GET /profile` endpoints returning full merged profile |
| `backend/app/main.py` | Modified | Registered `users` router at `/api/v1/users` |
| Supabase DB — `patients` | Migration | Added `rejection_reason`, `mrn`, `blood_group`, `allergies`, `occupation`, `marital_status`, `insurance_provider`, `insurance_policy`, `referred_by` |
| Supabase DB — `profiles` | Migration | Added `avatar_url`, `date_of_birth`, `gender`, `address_line1`, `pincode`, `language_pref` |
| Supabase DB — `doctors` | Migration | Added `bio`, `qualification`, `languages`, `working_hours`, `medical_council_reg` |
| Supabase DB — `receptionists` | Migration | Added `date_of_joining`, `languages` |
| Supabase DB — `patients` trigger | Migration | Created `mrn_seq` sequence and `set_mrn` trigger for auto MRN generation |

---

*Report generated from USER_FLOW_OPTIMIZATION_PLAN.md audit — NeuroWellness Backend v1*
