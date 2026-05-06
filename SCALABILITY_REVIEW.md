# Backend & DB Scalability Review — NeuroWellness

**Reviewed:** 2026-05-06  
**Scope:** `neurowellness-backend-v1` — FastAPI backend + Supabase DB schema  
**Author:** Claude (commissioned by Amit)

---

The foundation Mohan has built is solid — the clinic-scoped architecture, role hierarchy, and PRS engine are well-thought-out. But there are specific issues that will cause real problems before this reaches production scale. Grouped by severity:

---

## 🔴 Critical — Will Break Under Load or Cause Data Corruption

### 1. The Supabase admin client is a shared singleton

`get_supabase_admin()` uses `@lru_cache()` and returns one client instance shared across all concurrent requests. The Supabase Python client is not thread-safe. Under concurrent load — two receptionists registering patients at the same time — requests will interfere with each other.

**Fix:** Remove the `@lru_cache()` from `get_supabase_admin()` and create a fresh client per request, or use a properly thread-safe connection factory.

---

### 2. `current_patient_count` is a race condition

In `staff.py` and `auth.py`, doctor load balancing works like this:

```python
count = existing.data[0].get("current_patient_count") + 1
admin.table("doctors").update({"current_patient_count": count})
```

This is a read-then-write pattern. Two simultaneous patient registrations both read `count=10`, both write `11`. The actual count should be `12`. At a busy clinic front desk with multiple staff registering simultaneously, patient allocations will silently go wrong.

**Fix:** Use a SQL-level atomic increment. Call an RPC or use raw SQL:
```sql
UPDATE doctors SET current_patient_count = current_patient_count + 1
```

---

### 3. No database transactions — multi-step writes are not atomic

Patient registration involves 4 sequential writes:

1. Create Supabase auth user
2. Insert into `profiles`
3. Insert into `patients`
4. Update doctor count

If step 3 or 4 fails, you have an orphaned auth user with a profile but no patient record. The rollback attempt in the `except` block (`admin.auth.admin.delete_user(user_id)`) can itself fail silently, leaving the DB in a permanently inconsistent state. This is acceptable for a prototype but not for a medical system.

**Fix:** Wrap the multi-step patient/staff creation logic into a Supabase database function (RPC) called as a single transaction. The Python code calls one `rpc()` instead of 4 sequential table operations.

---

### 4. PRS `instance_id` generation has a sequence race condition

```python
instance_id = f"PAT/{patient_id[:8]}/{seq:03d}"
```

The sequence number is computed by counting existing instances in Python and adding 1. Two concurrent assessment starts for the same patient will both read `seq=1`, both generate `PAT/abc12345/001`, and the second insert will fail with a unique constraint violation. Also, truncating a UUID to 8 characters doesn't guarantee uniqueness across patients — two patients could share the same 8-character prefix.

**Fix:** Generate `instance_id` in the database using a sequence or use a proper UUID for runtime tables (`assessment_permissions`, `prs_assessment_instances`, `prs_responses`). Keep human-readable composite keys only for reference/config tables (`diseases`, `scales`, `questions`) where they genuinely help readability.

---

## 🟡 Important — Will Cause Problems Before Scale

### 5. RLS is defined in the schema but bypassed entirely by the API

Every API endpoint calls `get_supabase_admin()` which uses the service role key and skips all RLS policies. The RLS policies in the schema doc are never exercised in practice. This means the database has no independent safety net — if there's ever an authorization bug in the Python layer, the DB won't catch it. For a healthcare platform this is a significant risk.

**Fix:** Use `get_supabase()` (the anon client with the user's JWT) for read operations inside a user's own data scope, and reserve `get_supabase_admin()` for admin-privileged writes only. This actually exercises your RLS policies as a second layer of defense.

---

### 6. `sessions` and `assessment_permissions` tables have no `clinic_id`

The staff dashboard code even has a comment acknowledging this:

```python
# instance doesn't have clinic_id yet
```

This means a Kharadi receptionist's "upcoming sessions" query cannot be filtered to Kharadi — it will show sessions from all clinics. As you add more clinics, this becomes a data leakage and correctness problem.

**Fix:** Add `clinic_id` column to `sessions`, `assessment_permissions`, and `prs_assessment_instances`. Populate it from the patient's `clinic_id` at creation time.

---

### 7. Hard delete of patients loses all medical history

When a patient is rejected (`PUT /staff/patients/{id}/reject`) the code does:

```python
admin.table("patients").delete()
admin.table("profiles").delete()
admin.auth.admin.delete_user(patient_id)
```

This permanently destroys all data. For an EMR, healthcare regulations (and common sense) require retaining records. If a patient was ever assessed and then rejected, those assessment records are gone permanently.

**Fix:** Implement soft delete everywhere. Add `is_deleted`, `deleted_at`, `deleted_by` to `profiles` and `patients`. Never hard-delete patient records. The `DELETE /admin/patients/:id` endpoint has the same problem.

---

### 8. The JWKS cache has no TTL — auth will break after a key rotation

```python
@lru_cache(maxsize=1)
def _get_jwks() -> dict:
```

Supabase rotates JWT signing keys periodically. When that happens, this cache returns the old keys forever, causing every token to fail verification until the server is manually restarted. Nobody will know why logins are suddenly broken.

**Fix:** Replace `lru_cache` with a time-based cache (e.g., `cachetools.TTLCache` with 3600 seconds). The key will refresh hourly.

---

### 9. `doctor_patient_allocations` history table is not consistently maintained

The `doctor_patient_allocations` table exists specifically to track assignment history, but in several code paths (auto-allocation on approval in `staff.py`, allocation in `auth.py`) only `patients.assigned_doctor_id` is updated — the allocation history table is never written. The manual allocate endpoint (`POST /staff/patients/{id}/allocate`) does write to it, but the automatic path doesn't.

**Fix:** Centralise all doctor assignment logic into a single `assign_patient_to_doctor()` helper that always writes both the `patients` table and the `doctor_patient_allocations` table.

---

### 10. N+1 query patterns in admin list endpoints

In `admin.py` `list_patients()`, the code fetches all patients, then runs a second query for all clinic names, then a third query for all doctor names — done via Python dictionary building. This is fine at 50 patients but will become slow at 500+. The `list_staff()` endpoint in `admin.py` does a separate DB call per staff member to get role-specific details (`_row(admin, table, "id", p["id"])`), meaning 20 staff = 21 DB queries.

**Fix:** Use Supabase's JOIN syntax (`.select("*, clinics(clinic_name), doctors(specialization)")`) to fetch related data in one query. For the role-specific staff detail, batch the `doctors`, `receptionists`, and `clinical_assistants` queries once per list load, not per row.

---

### 11. No audit logging in the application

The schema has an `audit_logs` table. The code never writes to it. For a medical platform, every sensitive action needs a permanent, tamper-proof record: who registered which patient, who approved/rejected whom, who granted an assessment, which doctor was allocated.

**Fix:** Write a simple `log_action(actor_id, action, table_name, record_id, old_data, new_data)` helper and call it on every write endpoint — patient registration, approval/rejection, doctor allocation, assessment grant, staff deactivation.

---

## 🟠 Architecture Gaps — Address Before Multi-Clinic Production

### 12. `date_of_birth` and `gender` may be silently dropped on registration

The registration code inserts `date_of_birth` and `gender` into `profiles`, but the schema doc's `profiles` table definition doesn't list these columns. If they're missing in the actual DB, these values are silently dropped on every registration with no error. For a clinical platform, DOB is mandatory for patient identification.

**Fix:** Verify these columns exist in the live Supabase table. Add them to the schema doc. Add them to the DB if missing.

---

### 13. `_allocate_doctor` makes 3 sequential DB round-trips per registration

The doctor allocation logic runs 3 separate queries (city profiles → state profiles → doctor availability). At any non-trivial load this adds 3 unnecessary network hops on every patient registration.

**Fix:** Consolidate into a single SQL function / RPC that does the city → state → any fallback logic in one database round-trip.

---

### 14. No multi-admin support per clinic

The `admins` table has a `clinic_id` FK and a 1:1 relationship with auth users. There's no way for a clinic to have two admin users (e.g., a day-shift admin and a night-shift admin, or a super-admin plus a clinic-level admin). The bootstrap endpoint creates one admin and that's it — there's no endpoint to add a second admin to a clinic.

**Fix:** Make `admins.clinic_id` support multiple rows per clinic (the PK is already the user id, so this is already structurally correct). Add an admin endpoint to invite/create additional admins for a clinic.

---

### 15. Bootstrap endpoint is always active in production

```python
BOOTSTRAP_SECRET_KEY: str = ""
```

If this isn't set, the check `not settings.BOOTSTRAP_SECRET_KEY` blocks requests, which is correct. But there's no way to permanently disable the endpoint in production — someone could set the key in `.env` and silently create clinics. For a production EMR, this endpoint should return 404 unless `ENVIRONMENT == "development"`.

---

## Summary Table

| # | Issue | Impact | Effort to Fix |
|---|-------|--------|---------------|
| 1 | Shared singleton DB client | Data corruption under load | Low |
| 2 | Race condition on `current_patient_count` | Wrong doctor allocation | Low |
| 3 | No DB transactions on multi-step writes | Orphaned/inconsistent records | Medium |
| 4 | PRS instance ID race condition | Duplicate key errors in assessments | Medium |
| 5 | RLS bypassed entirely | No DB-level safety net | Medium |
| 6 | No `clinic_id` on sessions/permissions | Data leaks across clinics | Medium |
| 7 | Hard delete of patients | Permanent loss of medical records | Low |
| 8 | JWKS cache has no TTL | Auth silently breaks post key rotation | Low |
| 9 | Allocation history not maintained | Incomplete audit trail | Low |
| 10 | N+1 queries in admin lists | Performance degradation at scale | Medium |
| 11 | No audit logging | No tamper-proof trail for compliance | Medium |
| 12 | DOB/gender may be dropped silently | Missing clinical data | Low |
| 13 | Doctor allocation = 3 DB round-trips | Slow registration under load | Low |
| 14 | One admin per clinic only | Operational limitation | Medium |
| 15 | Bootstrap endpoint always active | Security risk in production | Low |

---

**Priority:** Fix issues **#1–4** before putting any real clinic data into this system. These will cause data corruption or hard failures under concurrent load. The remaining issues are important for a production rollout but won't cause immediate breakage.
