# NeuroWellness — System Documentation

> Stack: **FastAPI** (Python) backend · **Supabase** (PostgreSQL + Auth) · **React + Vite** frontend · **Zustand** state management

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication Flow](#authentication-flow)
3. [Role-Based Access](#role-based-access)
4. [Frontend — Routes & Pages](#frontend--routes--pages)
5. [Frontend — State Management](#frontend--state-management)
6. [Assessment Flow (PRS)](#assessment-flow-prs)
7. [API Endpoints Reference](#api-endpoints-reference)
   - [Auth](#auth-apiv1auth)
   - [Doctors](#doctors-apiv1doctors)
   - [Patients](#patients-apiv1patients)
   - [Staff](#staff-apiv1staff)
   - [Notifications](#notifications-apiv1notifications)
   - [PRS Scales](#prs-scales-apiv1prsscales)
   - [PRS Conditions](#prs-conditions-apiv1prsconditions)
   - [PRS Permissions](#prs-permissions-apiv1prspermissions)
   - [PRS Assessment](#prs-assessment-apiv1prsassessment)
   - [PRS Scores](#prs-scores-apiv1prsscores)
8. [Database Tables](#database-tables)
9. [Key Data Shapes](#key-data-shapes)

---

## Architecture Overview

```
Browser (React + Vite)
       │  Axios (Authorization: Bearer <JWT>)
       ▼
FastAPI Backend  ──▶  Supabase Admin Client (service-role key)
       │                      │
       │              PostgreSQL DB (Supabase)
       │
       └──▶  Supabase Auth (ES256 JWT verification via JWKS)
```

- Every request carries a **Supabase ES256 JWT** in `Authorization: Bearer`.
- The backend verifies the JWT locally (JWKS-first, HS256 fallback) — no per-request network call to Supabase Auth.
- The **admin client** (service-role key) is LRU-cached and never used for sign-in — a fresh client is created for `sign_in_with_password` to avoid session pollution.
- All responses follow `{ success, data, message }` envelope.
- Rate limiting is applied via **slowapi** (`Limiter` with `get_remote_address`).

---

## Authentication Flow

### Registration

```
RegisterPage.jsx
  └─▶ POST /api/v1/auth/register
        Backend:
          1. admin.auth.admin.create_user() — creates Supabase auth user (email_confirm: true)
          2. _create_profile_rows() — upserts profiles + role table row
             • patient             → patients table + auto-allocate doctor
             • doctor              → doctors table
             • receptionist        → receptionists table
             • clinical_assistant  → clinical_assistants table
             • admin               → admins table
          3. fresh_client.sign_in_with_password() — returns session tokens
          Returns: { access_token, refresh_token, role, user_id }
  └─▶ supabase.auth.setSession(access_token, refresh_token)
  └─▶ GET /api/v1/auth/me  →  set authStore { user, profile, role }
  └─▶ navigate to role dashboard
```

### Login

```
LoginPage.jsx
  └─▶ supabase.auth.signInWithPassword(email, password)
        Returns Supabase session with access_token
  └─▶ GET /api/v1/auth/me  →  set authStore { user, profile, role }
  └─▶ navigate to role dashboard
        doctor             → /doctor/dashboard
        patient            → /patient/dashboard
        receptionist       → /receptionist/dashboard
        clinical_assistant → /clinical-assistant/dashboard
        admin              → /doctor/dashboard
```

### Token Refresh (api.js interceptor)

```
Every Axios request:
  └─▶ supabase.auth.getSession() — get current (possibly refreshed) access_token
  └─▶ Attach header: Authorization: Bearer <access_token>
  └─▶ On 401 response: supabase.auth.signOut() + redirect /login
```

### Session Restore (App mount)

```
App.jsx  useEffect → authStore.init()
  └─▶ supabase.auth.getSession()
      ├─ Session found → GET /api/v1/auth/me → populate store
      └─ No session    → isAuthenticated = false
```

---

## Role-Based Access

| Role | Allowed Areas |
|------|--------------|
| `patient` | `/patient/*`, `/assessment` |
| `doctor` | `/doctor/*`, `/assessment` |
| `receptionist` | `/receptionist/*` |
| `clinical_assistant` | `/clinical-assistant/*`, `/assessment` |
| `admin` | All routes |

### Backend Dependency Guards

| Guard | Allowed Roles |
|-------|--------------|
| `require_doctor` | `doctor`, `admin` |
| `require_patient` | `patient` |
| `require_receptionist` | `receptionist`, `admin` |
| `require_clinical_assistant` | `clinical_assistant`, `admin` |
| `require_staff` | `doctor`, `clinical_assistant`, `receptionist`, `admin` |
| `get_current_user` | Any authenticated user |

---

## Frontend — Routes & Pages

| Path | Component | Required Role | API Calls |
|------|-----------|--------------|-----------|
| `/login` | `LoginPage` | Public | `GET /auth/me` |
| `/register` | `RegisterPage` | Public | `POST /auth/register` |
| `/doctor/dashboard` | `DoctorDashboard` | `doctor` | `GET /doctors/dashboard` |
| `/doctor/patients` | `PatientList` | `doctor` | `GET /doctors/patients` |
| `/doctor/patients/:id` | `PatientDetail` | `doctor` | `GET /doctors/patients/:id`, `GET /prs/conditions`, `POST /doctors/patients/:id/grant-assessment` |
| `/patient/dashboard` | `PatientDashboard` | `patient` | `GET /patients/dashboard` |
| `/patient/assessments` | `MyAssessments` | `patient` | `GET /patients/my-assessments` |
| `/patient/scores` | `MyScores` | `patient` | `GET /patients/my-scores` |
| `/receptionist/dashboard` | `ReceptionistDashboard` | `receptionist` | `GET /staff/dashboard` |
| `/receptionist/patients` | `ReceptionistPatientList` | `receptionist` | `GET /staff/patients` |
| `/receptionist/patients/:id` | `ReceptionistPatientDetail` | `receptionist` | `GET /staff/patients/:id`, `GET /staff/doctors`, `POST /staff/patients/:id/allocate` |
| `/clinical-assistant/dashboard` | `ClinicalAssistantDashboard` | `clinical_assistant` | `GET /staff/dashboard` |
| `/clinical-assistant/patients` | `ClinicalAssistantPatientList` | `clinical_assistant` | `GET /staff/patients` |
| `/clinical-assistant/patients/:id` | `ClinicalAssistantPatientDetail` | `clinical_assistant` | `GET /staff/patients/:id`, `GET /prs/conditions`, `POST /doctors/patients/:id/grant-assessment` |
| `/assessment` | `AssessmentPage` | Any authenticated | `POST /prs/assessment/start`, `POST /prs/assessment/submit` |

### ProtectedRoute Behaviour

- If `isLoading` → show spinner
- If `!isAuthenticated` → redirect `/login`
- If `requiredRole` set and `role !== requiredRole` and `role !== 'admin'` → redirect to own dashboard

---

## Frontend — State Management

### authStore (Zustand)

```js
{
  user: Supabase.User | null,
  profile: {
    id, email, full_name, role, phone, city, state,
    // doctor extras
    specialization?, license_number?, hospital_affiliation?,
    // patient extras
    medical_history?, emergency_contact?,
    // staff extras
    employee_id?, department?, designation?,
    availability?
  } | null,
  role: "patient" | "doctor" | "receptionist" | "clinical_assistant" | "admin" | null,
  isLoading: boolean,
  isAuthenticated: boolean,
  // Actions
  init(), login(email, password), register(formData), logout()
}
```

### prsStore (Zustand)

```js
{
  // Catalogues
  scales: Scale[],
  conditions: Condition[],

  // Active single-scale session
  activeSession: { instance_id, scale_id, scale } | null,
  currentQuestionIndex: number,
  responses: { [qIndex]: { value: string, label?: string } },
  submittedScore: ScoreResult | null,
  isLoading: boolean,

  // Disease queue (patient multi-scale mode)
  diseaseId: string | null,
  diseaseName: string | null,
  diseaseQueue: { scale_id, scale_name }[],
  queueIndex: number,
  completedScores: { scale_name, score: ScoreResult }[],

  // Actions
  fetchScales(), fetchConditions(),
  initDiseaseQueue(diseaseId, diseaseName, pendingScales),
  advanceQueue(), recordScoreAndAdvance(scaleName, score),
  startAssessment(scale_id, taken_by, patient_id?),
  setResponse(qIndex, value, label?),
  nextQuestion(), prevQuestion(), goToQuestion(index),
  submitAssessment(),
  resetAssessment()
}
```

---

## Assessment Flow (PRS)

### Patient Taking a Disease Assessment

```
MyAssessments page
  └─▶ GET /patients/my-assessments
       Returns permissions grouped by disease_id
  └─▶ Click "Take Test" on a disease card
  └─▶ prsStore.initDiseaseQueue(diseaseId, diseaseName, pendingScales)
  └─▶ navigate('/assessment')

AssessmentPage — Phase Machine
  INTRO
    Show disease name + list of all scales
    "Begin Assessment" → SCALE_INTRO

  SCALE_INTRO  (per scale)
    Show scale name + instructions
    "Skip this scale" → advanceQueue() → next SCALE_INTRO or DONE
    "Begin Scale"     → POST /prs/assessment/start  → RUNNING

  RUNNING
    ScaleRunner renders questions one at a time
    Supports branching (skip_to_question, skip_to_end)
    On final question submit → POST /prs/assessment/submit → SCORE

  SCORE
    Shows: calculated_value / max_possible, severity badge, clinical alerts
    "Next Scale →"    → recordScoreAndAdvance() → SCALE_INTRO
    "Skip Remaining"  → DONE

  DONE
    Summary table of all completed scales with scores + severity
    "Back to Assessments" → resetAssessment() → /patient/assessments
```

### Doctor / Clinical Assistant Taking On Behalf

```
PatientDetail / ClinicalAssistantPatientDetail
  └─▶ Click "Take on Behalf" on a permission row
  └─▶ navigate('/assessment?scale_id=X&patient_id=Y')

AssessmentPage (single-scale mode, isSingleMode=true)
  SCALE_INTRO → RUNNING → SCORE → back to previous page
  taken_by = "doctor_on_behalf"
  patient_id passed to POST /prs/assessment/start
```

### Granting an Assessment (Doctor / Clinical Assistant)

```
PatientDetail or ClinicalAssistantPatientDetail
  Select disease from dropdown (loaded from GET /prs/conditions)
  Click "Grant All Scales"
  └─▶ POST /doctors/patients/:id/grant-assessment { disease_id }
       Backend:
         1. Validates disease exists in prs_diseases
         2. Fetches all scale_ids from prs_disease_scale_map for that disease
         3. _get_or_create_session() — finds or creates a sessions row
            • clinical_assistant uses patient's assigned_doctor_id for the session
         4. Bulk-upserts assessment_permissions rows (status='granted')
         5. Inserts notification for the patient
       Returns: { disease_name, scales_granted, session_id }
```

---

## API Endpoints Reference

> Base URL: `http://localhost:8000/api/v1`
> All protected endpoints require: `Authorization: Bearer <JWT>`
> All responses: `{ success: bool, data: any, message: string }`

---

### Auth `/api/v1/auth`

| Method | Endpoint | Rate Limit | Auth | Description |
|--------|----------|-----------|------|-------------|
| `POST` | `/register` | 5/min | None | Create user in Supabase auth + all profile tables. Returns session tokens. Supports roles: `patient`, `doctor`, `receptionist`, `clinical_assistant`, `admin`. |
| `POST` | `/sync-profile` | 10/min | Any | Upsert profile rows for already-authenticated user. Used as fallback if register fails mid-way. |
| `GET` | `/me` | 60/min | Any | Returns full profile object merged from `profiles` + role-specific table. Throws `PROFILE_NOT_FOUND` if no profile row. |

**POST /register — Request Body**
```json
{
  "full_name": "Dr. Jane Smith",
  "email": "jane@clinic.com",
  "password": "secret123",
  "role": "doctor",
  "phone": "+91 98765 43210",
  "city": "Mumbai",
  "state": "Maharashtra",
  "specialization": "Neurology",
  "license_number": "MCI-12345"
}
```

---

### Doctors `/api/v1/doctors`

| Method | Endpoint | Rate Limit | Auth | Description |
|--------|----------|-----------|------|-------------|
| `GET` | `/dashboard` | 60/min | Doctor | Dashboard: profile, patients summary (`total`, `pending_assessments`), last 5 completed assessment scores. |
| `GET` | `/patients` | 60/min | Doctor | Paginated patient list. Query: `?search=name&skip=0&limit=20`. Joins `profiles` for names. |
| `GET` | `/patients/:id` | 60/min | Doctor | Full patient detail: basic info, all `assessment_permissions` (with scale names), scores summary, recent instances. |
| `POST` | `/patients/:id/grant-assessment` | 20/min | Doctor, Clinical Assistant | Grant all scales for a disease. Body: `{ disease_id, notes? }`. Creates a session, bulk-upserts permissions, notifies patient. |
| `PUT` | `/availability` | 20/min | Doctor | Update own availability. Body: `{ availability: "available" \| "unavailable" }`. |

---

### Patients `/api/v1/patients`

| Method | Endpoint | Rate Limit | Auth | Description |
|--------|----------|-----------|------|-------------|
| `GET` | `/dashboard` | 60/min | Any auth | Dashboard data: merged profile, assigned doctor info, pending assessment list, 3 recent scores, in-progress instances. |
| `GET` | `/my-doctor` | 60/min | Any auth | Assigned doctor's name, phone, specialization, hospital affiliation. Returns `null` if not assigned. |
| `GET` | `/my-assessments` | 60/min | Any auth | All `assessment_permissions` for the logged-in patient, with `prs_scales` and `prs_diseases` joined. Used to build disease cards. |
| `GET` | `/my-scores` | 60/min | Any auth | All assessment scores from `prs_final_results` for the patient, ordered newest-first. |

---

### Staff `/api/v1/staff`

| Method | Endpoint | Rate Limit | Auth | Description |
|--------|----------|-----------|------|-------------|
| `GET` | `/dashboard` | 60/min | Staff | Role-aware dashboard. Receptionist gets `upcoming_sessions[]`. Clinical assistant gets `recent_scores[]`. Both get `patients_summary`. |
| `GET` | `/patients` | 60/min | Staff | Paginated patient list (all patients). Query: `?search=name&skip=0&limit=20`. |
| `GET` | `/patients/:id` | 60/min | Staff | Patient detail + `recent_sessions[]`. Clinical assistant also gets `permissions[]` and `scores_summary[]`. |
| `GET` | `/doctors` | 60/min | Staff | All active doctors with `full_name`, `email`, `specialization`, `availability`, `current_patient_count`. Used for allocation dropdown. |
| `POST` | `/patients/:id/allocate` | 20/min | Receptionist | Assign patient to a doctor. Body: `{ doctor_id, notes? }`. Updates `patients.assigned_doctor_id` and upserts `doctor_patient_allocations`. |

---

### Notifications `/api/v1/notifications`

| Method | Endpoint | Rate Limit | Auth | Description |
|--------|----------|-----------|------|-------------|
| `GET` | `/` | 60/min | Any auth | List user's 20 most recent notifications ordered by `created_at` desc. |
| `PUT` | `/read-all` | 20/min | Any auth | Mark all notifications as read for the current user. |
| `PUT` | `/:id/read` | 30/min | Any auth | Mark a single notification as read by its UUID. |

---

### PRS Scales `/api/v1/prs/scales`

| Method | Endpoint | Rate Limit | Auth | Description |
|--------|----------|-----------|------|-------------|
| `GET` | `/` | 60/min | Any auth | Paginated list of all scales. Query: `?skip=0&limit=20`. |
| `GET` | `/by-code/:code` | 60/min | Any auth | Get a scale by its `scale_code` (e.g., `PHQ9`) with all questions and options. |
| `GET` | `/:scale_id` | 60/min | Any auth | Get a scale by UUID with all questions and options. |

---

### PRS Conditions `/api/v1/prs/conditions`

| Method | Endpoint | Rate Limit | Auth | Description |
|--------|----------|-----------|------|-------------|
| `GET` | `/` | 60/min | Any auth | List all active diseases/conditions (`disease_id`, `disease_name`, `description`). |
| `GET` | `/:disease_id` | 60/min | Any auth | Get one disease with its mapped scales list (`prs_disease_scale_map` join). |

---

### PRS Permissions `/api/v1/prs/permissions`

| Method | Endpoint | Rate Limit | Auth | Description |
|--------|----------|-----------|------|-------------|
| `POST` | `/` | 20/min | Doctor, Clinical Assistant | Grant a patient assessment permissions for a disease. Body: `{ patient_id, disease_id, notes? }`. |
| `GET` | `/patient/:id` | 60/min | Staff | All permissions for a patient, with `prs_scales` and `prs_diseases` joined. |
| `GET` | `/my` | 60/min | Any auth | Current user's permissions with `status='granted'`. |
| `PUT` | `/:id/revoke` | 20/min | Doctor | Set permission `status='revoked'`, record `revoked_at`. Only revokes own granted permissions. |

---

### PRS Assessment `/api/v1/prs/assessment`

| Method | Endpoint | Rate Limit | Auth | Description |
|--------|----------|-----------|------|-------------|
| `POST` | `/start` | 30/min | Any auth | Start an assessment session. Creates `prs_assessment_instances` row, returns scale + all questions + options. |
| `POST` | `/submit` | 30/min | Any auth | Submit responses. Runs scoring engine, saves `prs_scale_results` + `prs_responses`, marks permission `completed`, marks instance `completed`. Returns score. |

**POST /start — Request Body**
```json
{
  "scale_id": "uuid",
  "taken_by": "patient",
  "patient_id": null
}
```

- `taken_by`: `"patient"` (patient taking own) | `"doctor_on_behalf"` (doctor/CA taking for patient)
- `patient_id`: required when `taken_by = "doctor_on_behalf"`

**POST /submit — Request Body**
```json
{
  "instance_id": "PAT/abc12345/001",
  "scale_id": "uuid",
  "responses": [
    { "question_index": 0, "response_value": "2", "response_label": "More than half the days" }
  ]
}
```

**Submit — Response Data**
```json
{
  "scale_result_id": "PAT/abc12345/001/uuid",
  "calculated_value": 14,
  "max_possible": 27,
  "severity_level": "moderate",
  "severity_label": "Moderate Depression"
}
```

---

### PRS Scores `/api/v1/prs/scores`

| Method | Endpoint | Rate Limit | Auth | Description |
|--------|----------|-----------|------|-------------|
| `GET` | `/me` | 60/min | Any auth | Paginated scores from `prs_final_results` for current user. Query: `?skip=0&limit=20`. |
| `GET` | `/me/summary` | 60/min | Any auth | All scores for current user (no pagination) as a summary list. |
| `GET` | `/patient/:id/summary` | 60/min | Staff | All scores summary for a specific patient. |
| `GET` | `/patient/:id` | 60/min | Staff | Paginated assessment instances for a patient, each with nested `scale_results[]` and `responses[]`. |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Core user record: `id`, `role`, `full_name`, `email`, `phone`, `city`, `state`, `is_active` |
| `doctors` | Doctor extras: `specialization`, `license_number`, `availability`, `current_patient_count` |
| `patients` | Patient extras: `medical_history`, `emergency_contact`, `assigned_doctor_id` |
| `receptionists` | Staff extras: `employee_id`, `department`, `designation` |
| `clinical_assistants` | Staff extras: `employee_id`, `department`, `designation` |
| `admins` | Admin extras: `employee_id`, `department` |
| `sessions` | Clinic sessions: `patient_id`, `doctor_id`, `session_type`, `status`, `session_date` |
| `doctor_patient_allocations` | History of patient→doctor assignments |
| `prs_diseases` | Disease catalogue: `disease_id`, `disease_name` |
| `prs_scales` | Scale catalogue: `scale_id`, `scale_code`, `scale_name`, `total_questions` |
| `prs_disease_scale_map` | Which scales belong to which disease (with `display_order`) |
| `prs_questions` | Questions per scale with `answer_type`, `display_order` |
| `prs_options` | Answer options per question with `points` |
| `prs_question_branches` | Branching rules: `branch_type`, `trigger_question_index`, `target_question_index` |
| `assessment_permissions` | Patient-scale access grants: `status` (`granted`/`completed`/`revoked`) |
| `prs_assessment_instances` | In-progress/completed assessment runs: `instance_id`, `status`, `initiated_by` |
| `prs_scale_results` | Computed score per scale per instance |
| `prs_responses` | Individual question responses per instance |
| `prs_final_results` | Aggregated final result per instance (populated by DB trigger or future logic) |
| `notifications` | User notifications: `type`, `title`, `body`, `is_read`, `metadata` |

---

## Key Data Shapes

### Permission Object

```json
{
  "id": "uuid",
  "patient_id": "uuid",
  "doctor_id": "uuid",
  "scale_id": "uuid",
  "disease_id": "uuid",
  "session_id": "uuid",
  "status": "granted | completed | revoked",
  "granted_at": "2025-04-08T10:00:00Z",
  "prs_scales": { "scale_name": "PHQ-9", "scale_code": "PHQ9" },
  "prs_diseases": { "disease_name": "Depression" }
}
```

### Scale Object (from `/assessment/start`)

```json
{
  "scale_id": "uuid",
  "scale_name": "Patient Health Questionnaire (PHQ-9)",
  "scale_code": "PHQ9",
  "total_questions": 9,
  "questions": [
    {
      "question_index": 0,
      "question_text": "Little interest or pleasure in doing things",
      "answer_type": "likert",
      "options": [
        { "value": "0", "label": "Not at all", "points": 0 },
        { "value": "3", "label": "Nearly every day", "points": 3 }
      ]
    }
  ]
}
```

### Score Result (from `/assessment/submit`)

```json
{
  "calculated_value": 14,
  "max_possible": 27,
  "severity_level": "moderate",
  "severity_label": "Moderate Depression",
  "risk_flags": [
    { "priority": "high", "message": "Suicidal ideation indicated on item 9" }
  ]
}
```

---

*Generated: 2026-04-08 | NeuroWellness v1.0*
