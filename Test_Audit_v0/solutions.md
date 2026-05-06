# NeuroWellness — Scalability Review: Issue Solutions Report

> Generated: 2026-05-06  
> Reviewed by: QA Testing Team  
> Total Issues: 15 | Applied: 6 | Deferred: 8 | Not Needed: 1

---

## Summary Table

| # | Issue | Status | Impact |
|---|-------|--------|--------|
| 1 | `@lru_cache` on admin Supabase client | ✅ Fixed | Critical — thread-safety |
| 2 | Race condition on `current_patient_count` | ✅ Fixed | Critical — data integrity |
| 3 | Non-atomic multi-step registration | ✅ Fixed | Critical — data consistency |
| 4 | PRS `instance_id` race condition | ✅ Fixed | High — uniqueness collision |
| 5 | RLS bypassed by service role key | ⏳ Deferred | High — security |
| 6 | Missing `clinic_id` on sessions/permissions/instances | ✅ Fixed | High — data isolation |
| 7 | Hard delete loses medical history | ⏳ Deferred | High — compliance |
| 8 | JWKS cache has no TTL | ✅ Fixed | High — auth reliability |
| 9 | Doctor allocation history inconsistent | ⏳ Deferred | Medium — audit trail |
| 10 | N+1 query patterns in admin list endpoints | ✅ Fixed | Medium — performance |
| 11 | No audit logging | ⏳ Deferred | High — compliance |
| 12 | `date_of_birth`/`gender` silently dropped | ✅ Fixed | Medium — data integrity |
| 13 | `_allocate_doctor` 3 sequential round-trips | ⏳ Deferred | Medium — performance |
| 14 | No multi-admin support per clinic | 🚫 Not Needed | Design decision |
| 15 | Bootstrap endpoint always active in production | ⏳ Deferred | Medium — security |

---

## Issue 1 — `@lru_cache` on Admin Supabase Client

**Status:** ✅ Fixed

### Problem
`get_supabase_admin()` was decorated with `@lru_cache()`, meaning a single Supabase client instance was shared across all concurrent requests. The Supabase Python client maintains internal mutable state (auth session, request counters). Under concurrent load this causes race conditions, state corruption, and unpredictable authentication failures.

### Fix Applied
Removed `@lru_cache()` from `get_supabase_admin()` in `backend/app/database.py`. Each request now gets a fresh client instance. `get_supabase()` (anon client) and `get_settings()` retain their cache since they are stateless.

```python
# Before
@lru_cache()
def get_supabase_admin() -> Client:
    ...

# After
def get_supabase_admin() -> Client:
    """Fresh instance per call to avoid shared mutable state across concurrent requests."""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
```

### Files Changed
- `backend/app/database.py`

### Impact
- Eliminates thread-safety race conditions under concurrent load
- Slight overhead: one extra client instantiation per request (~1ms) — negligible vs. the risk removed
- Production stability significantly improved for multi-user scenarios

---

## Issue 2 — Race Condition on `current_patient_count`

**Status:** ✅ Fixed

### Problem
Doctor patient count was updated via a read-then-write pattern in Python:
```python
count = doctor["current_patient_count"]  # read
admin.table("doctors").update({"current_patient_count": count + 1})  # write
```
Two concurrent registrations reading the same count would both increment from the same base value, resulting in a lost update — the count would be `N+1` when it should be `N+2`.

### Fix Applied
Replaced the read-then-write with an atomic SQL increment via a Postgres RPC function `increment_doctor_patient_count`. The database handles the increment atomically inside a transaction — no Python-level read is needed.

```python
# Before
doctor = _row(admin, "doctors", "id", doctor_id)
admin.table("doctors").update({
    "current_patient_count": (doctor.get("current_patient_count") or 0) + 1
}).eq("id", doctor_id).execute()

# After
admin.rpc("increment_doctor_patient_count", {"doctor_id": doctor_id}).execute()
```

**SQL function:**
```sql
CREATE OR REPLACE FUNCTION increment_doctor_patient_count(doctor_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE doctors SET current_patient_count = current_patient_count + 1
    WHERE id = doctor_id;
END;
$$ LANGUAGE plpgsql;
```

### Files Changed
- `backend/app/routers/staff.py` — `approve_patient`
- `backend/app/routers/auth.py` — registration flow

### Impact
- Eliminates lost-update race condition under concurrent patient registrations
- Doctor workload counts are now accurate even under high concurrency
- No performance cost — atomic SQL increment is faster than a Python read + write

---

## Issue 3 — Non-Atomic Multi-Step Registration

**Status:** ✅ Fixed

### Problem
Patient registration involved 4 sequential, independent database writes:
1. INSERT into `profiles`
2. INSERT into `patients`
3. UPDATE `doctors` (patient count)
4. INSERT into `sessions` (if applicable)

If any step failed after step 1 succeeded, the database was left in a partially-written inconsistent state — an auth user with no profile, or a profile with no patient row. This required manual cleanup and was invisible to the user.

### Fix Applied
Consolidated all DB writes into a single Postgres RPC function `register_patient_db` that runs inside a transaction. If any step fails, the entire transaction rolls back atomically. The Python side only calls one RPC and handles the auth user cleanup on failure.

```python
# Before: 4 separate DB calls, any can fail independently
admin.table("profiles").insert({...}).execute()
admin.table("patients").insert({...}).execute()
admin.rpc("increment_doctor_patient_count", {...}).execute()

# After: one atomic RPC
admin.rpc("register_patient_db", {
    "p_id": user_id,
    "p_full_name": body.full_name,
    ...
    "p_approval_status": "pending",
}).execute()
```

A similar RPC `register_staff_db` was created for staff registration.

### Files Changed
- `backend/app/routers/auth.py`
- `backend/app/routers/staff.py`

### SQL Functions Created
- `register_patient_db(...)` — atomic patient registration transaction
- `register_staff_db(...)` — atomic staff registration transaction

### Impact
- Registration is now fully atomic — either everything succeeds or everything rolls back
- Eliminates orphaned auth users, profiles without patient rows, and partial data states
- Simplifies error handling — one try/except instead of four

---

## Issue 4 — PRS `instance_id` Race Condition

**Status:** ✅ Fixed

### Problem
PRS assessment instance IDs were generated in Python using a count-based formula:
```python
all_instances = admin.table("prs_assessment_instances").select("instance_id")
    .eq("patient_id", patient_id).execute().data or []
seq = len(all_instances) + 1
instance_id = f"PAT/{patient_id[:8]}/{seq:03d}"
```
Two concurrent requests for the same patient would read the same count, generate the same `instance_id`, and one insert would fail with a unique constraint violation. Additionally, different patients with the same first 8 UUID characters would collide on the prefix.

### Fix Applied
Replaced the Python-computed primary key with `uuid.uuid4()` — guaranteed globally unique regardless of concurrency. The human-readable label (`PAT/abc12345/003`) is preserved as a separate `instance_label` column for display purposes only, where slight inconsistency under concurrency is harmless.

```python
# Before
seq = len(all_instances) + 1
instance_id = f"PAT/{patient_id[:8]}/{seq:03d}"

# After
instance_id = str(uuid.uuid4())           # collision-free PK
instance_label = f"PAT/{patient_id[:8]}/{prior_count + 1:03d}"  # display only
```

**SQL migration required:**
```sql
ALTER TABLE prs_assessment_instances
    ADD COLUMN IF NOT EXISTS instance_label TEXT;
```

### Files Changed
- `backend/app/routers/prs/assessment.py`

### Impact
- Zero collision probability on concurrent assessment starts
- Human-readable label preserved for UI display
- Assessment start is now safe under any concurrency level

---

## Issue 5 — RLS Bypassed by Service Role Key

**Status:** ⏳ Deferred

### Problem
Every API endpoint uses `get_supabase_admin()` (service role key) which bypasses all Supabase Row Level Security policies. The RLS policies defined in the schema are never exercised — they provide no actual protection. If there's an authorization bug in the Python layer, the database has no independent safety net.

### Planned Fix
Use `get_supabase()` (anon client with user JWT) for operations where a user reads their own data scope. Reserve `get_supabase_admin()` for privileged writes only. This activates RLS as a second independent authorization layer.

### Deferred Reason
Requires auditing all existing RLS policies on every table before switching clients. Incomplete or incorrect policies would cause queries to silently return empty results. Scheduled for a dedicated security sprint.

---

## Issue 6 — Missing `clinic_id` on Sessions, Permissions, and Assessment Instances

**Status:** ✅ Fixed

### Problem
Three core tables — `sessions`, `assessment_permissions`, and `prs_assessment_instances` — had no `clinic_id` column. This meant:
- Receptionist dashboard showed upcoming sessions from ALL clinics, not just their own
- Staff pending assessment counts included other clinics' data
- Clinical assistant recent scores included assessments from other clinics
- The code even had a comment: `# instance doesn't have clinic_id yet`

### Fix Applied
Added `clinic_id` column to all three tables via SQL migration. Updated all insertion points to pull `clinic_id` from the patient's record and store it at creation time. Removed the `if False` workaround in the staff dashboard.

**SQL migrations:**
```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(clinic_id) ON DELETE SET NULL;
ALTER TABLE assessment_permissions ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(clinic_id) ON DELETE SET NULL;
ALTER TABLE prs_assessment_instances ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(clinic_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assessment_permissions_clinic_id ON assessment_permissions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_prs_instances_clinic_id ON prs_assessment_instances(clinic_id);
```

**Code changes:**
- `permissions.py` — `_get_or_create_session()` now accepts and stores `clinic_id`; permission rows include `clinic_id`
- `assessment.py` — instance insert now includes `clinic_id` from patient record
- `staff.py` — removed `if False` workaround; clinic filter on assessment instances now active

### Files Changed
- `backend/app/routers/prs/permissions.py`
- `backend/app/routers/prs/assessment.py`
- `backend/app/routers/staff.py`

### Impact
- Clinic data isolation is now enforced across the entire assessment workflow
- Receptionist dashboard shows only their clinic's upcoming sessions
- Clinical assistant recent scores scoped to their clinic only
- Eliminates cross-clinic data leakage as the platform scales to multiple clinics

---

## Issue 7 — Hard Delete Loses Medical History

**Status:** ⏳ Deferred

### Problem
`PUT /staff/patients/{id}/reject` and `DELETE /admin/patients/{id}` perform hard deletes — permanently destroying all patient data including assessment history, doctor notes, and session records. Healthcare regulations (HIPAA, DPDPA) require retaining medical records for 5–7 years minimum.

### Planned Fix
Implement soft delete: add `is_deleted`, `deleted_at`, `deleted_by` columns to `profiles` and `patients`. Never hard-delete patient records. Disable auth user via ban rather than deletion. Add `.eq("is_deleted", False)` filter to all listing queries.

### Deferred Reason
Requires careful migration of existing endpoints and testing to ensure soft-deleted patients don't appear in any listing. Scheduled alongside the compliance review sprint.

---

## Issue 8 — JWKS Cache Has No TTL

**Status:** ✅ Fixed

### Problem
The JWT signing keys (JWKS) fetched from Supabase were cached with `@lru_cache` — which caches forever for the process lifetime. Supabase periodically rotates JWT signing keys. When a rotation occurs, the server holds the old key permanently and every token verification fails, causing a complete auth outage requiring a manual server restart to resolve.

### Fix Applied
Replaced `@lru_cache` with `cachetools.TTLCache(maxsize=1, ttl=3600)`. Keys now refresh automatically every hour. A `threading.Lock` wrapper ensures thread-safe cache access under concurrent requests.

```python
# Before
@lru_cache(maxsize=1)
def _get_jwks() -> dict:
    ...

# After
_jwks_cache: TTLCache = TTLCache(maxsize=1, ttl=3600)
_jwks_lock = threading.Lock()

def _get_jwks() -> dict:
    with _jwks_lock:
        if "jwks" in _jwks_cache:
            return _jwks_cache["jwks"]
        # fetch and cache
        _jwks_cache["jwks"] = resp.json()
        return _jwks_cache["jwks"]
```

Added `cachetools>=5.3.0` to `requirements.txt`.

### Files Changed
- `backend/app/dependencies.py`
- `backend/requirements.txt`

### Impact
- Eliminates indefinite auth outage after Supabase key rotation
- Worst-case impact of a key rotation is now a 1-hour window — resolves automatically
- Thread-safe under concurrent request load
- No manual server restart needed for key rotation recovery

---

## Issue 9 — Doctor Allocation History Inconsistent

**Status:** ⏳ Deferred

### Problem
The `doctor_patient_allocations` history table is only written by the manual allocation endpoint (`POST /staff/patients/{id}/allocate`). Auto-allocation on patient approval (`staff.py`) and self-registration (`auth.py`) only update `patients.assigned_doctor_id` — never writing to the history table. Most patients have no allocation history record.

### Planned Fix
Create a single `assign_patient_to_doctor()` helper in a shared utility module that always writes both `patients.assigned_doctor_id` and `doctor_patient_allocations`. Replace all inline allocation code with this helper.

### Deferred Reason
Low operational impact while running a single clinic. Scheduled before multi-clinic reporting features are built.

---

## Issue 10 — N+1 Query Patterns in Admin List Endpoints

**Status:** ✅ Fixed

### Problem
Two admin list endpoints had severe query inefficiency:

- `list_patients()`: 3 sequential queries — patients, then all clinic names, then all doctor names
- `list_staff()`: `1 + N` queries — one profile list query, then one role-table query **per staff member**. 20 staff = 21 DB queries; 100 staff = 101 queries.

### Fix Applied

**`list_patients()`** — Used PostgREST inline JOIN to fetch clinic name in the same query as patients. Doctor names remain a single batched `.in_()` query.

```python
# Before: 3 queries
q = admin.table("patients").select("..., profiles(...)")
clinics = admin.table("clinics").select("clinic_id, clinic_name").execute()  # separate
dr_profiles = admin.table("profiles").select("id, full_name")...execute()    # separate

# After: 2 queries (clinics joined inline)
q = admin.table("patients").select(
    "..., profiles(...), clinics(clinic_name)"  # clinic joined in one query
)
```

**`list_staff()`** — Replaced per-row `_row()` calls with 3 batched queries (one per role table), then assembled from in-memory maps.

```python
# Before: 1 + N queries
for p in data:
    extra = _row(admin, table, "id", p["id"])  # 1 query per staff member

# After: 3 queries max regardless of staff count
doctor_rows = admin.table("doctors").select("*").in_("id", doctor_ids).execute()
receptionist_rows = admin.table("receptionists").select("*").in_("id", receptionist_ids).execute()
ca_rows = admin.table("clinical_assistants").select("*").in_("id", ca_ids).execute()
```

### Files Changed
- `backend/app/routers/admin.py` — `list_patients()` and `list_staff()`

### Impact

| Endpoint | Before | After |
|----------|--------|-------|
| `list_patients()` | 3 queries | 2 queries |
| `list_staff(N)` | 1 + N queries | 5 queries max |

- Admin pages load significantly faster as data grows
- No degradation as staff or patient count increases
- Eliminates the most common source of slow admin dashboard loads

---

## Issue 11 — No Audit Logging

**Status:** ⏳ Deferred

### Problem
The `audit_logs` table exists in the schema but the application never writes to it. Every sensitive action — patient approval/rejection, staff registration, assessment grants, doctor allocation — happens with no permanent record of who did what and when. This is a critical compliance gap for a healthcare platform under HIPAA/DPDPA.

### Planned Fix
Create a `log_action(actor_id, action, table_name, record_id, old_data, new_data)` helper in `backend/app/utils/audit.py`. Call it from every write endpoint across `auth.py`, `staff.py`, `admin.py`, and `prs/permissions.py`. Fire-and-forget — audit failure never blocks the main request.

### Deferred Reason
Implementation is straightforward but touches every write endpoint. Scheduled for a dedicated compliance sprint to ensure complete coverage.

---

## Issue 12 — `date_of_birth` and `gender` Silently Dropped on Registration

**Status:** ✅ Fixed

### Problem
Registration code passed `date_of_birth` and `gender` to the `register_patient_db` RPC. If these columns didn't exist in the live `profiles` table, Supabase would silently ignore them — registration succeeds but the data is permanently lost with no error. For a clinical platform, DOB is mandatory for patient identification.

### Fix Applied

**Verified:** The `register_patient_db` RPC function body correctly includes both fields in the `profiles` INSERT — confirmed by inspecting the function source.

**Added explicit validation** in both registration endpoints so missing DOB or gender returns a clear 400 error instead of silently succeeding:

```python
# auth.py — self-registration
if not body.date_of_birth:
    raise HTTPException(status_code=400, detail="Date of birth is required for patient registration.")
if not body.gender:
    raise HTTPException(status_code=400, detail="Gender is required for patient registration.")

# staff.py — staff-side registration
if not body.date_of_birth:
    raise BadRequestError("Date of birth is required for patient registration.")
if not body.gender:
    raise BadRequestError("Gender is required for patient registration.")
```

**Fixed** `getattr(body, "date_of_birth", None)` defensive pattern in `staff.py` to direct attribute access `body.date_of_birth` since the field is declared on the model.

**SQL to run in Supabase** (ensures columns exist at DB level):
```sql
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'));
```

### Files Changed
- `backend/app/routers/auth.py`
- `backend/app/routers/staff.py`

### Impact
- Missing DOB/gender now returns a clear, actionable error to the caller
- No more silent data loss on registration
- Patient identification data is guaranteed to be present in the database
- `getattr` defensive pattern removed — cleaner, more maintainable code

---

## Issue 13 — `_allocate_doctor` Makes 3 Sequential Round-Trips

**Status:** ⏳ Deferred

### Problem
The `_allocate_doctor` function (duplicated in `auth.py` and `staff.py`) makes up to 3 sequential database round-trips per patient registration: city doctor IDs → state doctor IDs → available doctors. Python-side filtering after each fetch adds unnecessary network hops and scales poorly as doctor count grows.

### Planned Fix
Consolidate into a single `allocate_doctor` Postgres RPC function that performs the city → state → any fallback logic entirely within the database in one round-trip. Replace both Python copies with a single shared helper that calls the RPC.

### Deferred Reason
Low impact at current scale (one clinic, small doctor roster). High priority before multi-clinic rollout.

---

## Issue 14 — No Multi-Admin Support Per Clinic

**Status:** 🚫 Not Needed

### Assessment
The current single-admin architecture is correct by design for this deployment. One global admin manages all clinics. The `admins` table structure already supports multiple admins per clinic (PK is user ID, not clinic ID) if needed in the future, but the current operational model does not require it.

### Decision
No changes made. Single global admin is the intended design.

---

## Issue 15 — Bootstrap Endpoint Always Active in Production

**Status:** ⏳ Deferred

### Problem
The bootstrap endpoint `POST /admin/clinics/create` is permanently reachable at a known URL in production, protected only by a secret key. If the key is leaked (committed to git, visible in logs, shared by an employee), anyone can silently create new clinics and admin accounts. The endpoint should return `404 Not Found` in production so it is not discoverable.

### Planned Fix
Add `ENVIRONMENT: str = "development"` to `config.py`. Gate the bootstrap endpoint to return `404` when `ENVIRONMENT == "production"`. Set `ENVIRONMENT=production` in the production `.env` file.

```python
if settings.ENVIRONMENT == "production":
    raise HTTPException(status_code=404, detail="Not found")
```

### Deferred Reason
Requires coordinating the `.env` change with the deployment pipeline to avoid accidentally locking out the endpoint during initial setup of new clinics. Scheduled before public launch.

---

## Deferred Issues — Action Plan

The following issues are deferred and should be addressed before public production launch:

| Priority | Fix | Effort | When |
|----------|-----|--------|------|
| 🔴 High | Fix 5 — RLS enforcement | Large | Security sprint |
| 🔴 High | Fix 7 — Soft delete for patients | Medium | Compliance sprint |
| 🔴 High | Fix 11 — Audit logging | Medium | Compliance sprint |
| 🟡 Medium | Fix 15 — Bootstrap endpoint in production | Small | Pre-launch |
| 🟡 Medium | Fix 9 — Doctor allocation history | Small | Before reporting features |
| 🟡 Medium | Fix 13 — `_allocate_doctor` round-trips | Medium | Before multi-clinic rollout |

---

*Report generated from SCALABILITY_REVIEW.md — NeuroWellness Backend v1*
