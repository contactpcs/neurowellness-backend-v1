# NeuroWellness — Clinical PRS Portal

A production-ready neuromodulation Patient Rating System (PRS) portal with separate Doctor and Patient portals.

---

## Tech Stack

| Layer     | Technology                                  |
|-----------|---------------------------------------------|
| Backend   | Python 3.12, FastAPI, Supabase (PostgreSQL) |
| Frontend  | React 18, Vite, Zustand, React Router v6    |
| Auth      | Supabase Auth (JWT ES256)                   |
| Database  | Supabase (PostgreSQL) — schema pre-created  |

---

## Project Structure

```
neurowellness/
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── main.py           # App entry point, CORS, route registration
│   │   ├── config.py         # Pydantic settings (reads .env)
│   │   ├── database.py       # Supabase client factory (lru_cache)
│   │   ├── dependencies.py   # JWT auth → get_current_user, require_doctor
│   │   ├── middleware/
│   │   │   └── logging.py    # Structured request logging (structlog)
│   │   ├── models/
│   │   │   ├── user.py       # Profile, Doctor, Patient Pydantic models
│   │   │   ├── prs.py        # Scale, Question, Assessment models
│   │   │   ├── session.py    # AssessmentSession model
│   │   │   └── common.py     # Shared base models
│   │   ├── routers/
│   │   │   ├── auth.py       # /auth/sync-profile, /auth/me
│   │   │   ├── doctors.py    # Doctor dashboard, patient list, grant assessment
│   │   │   ├── patients.py   # Patient dashboard, my assessments, my scores
│   │   │   ├── notifications.py
│   │   │   └── prs/
│   │   │       ├── scales.py       # List/get PRS scales
│   │   │       ├── conditions.py   # Neurological conditions
│   │   │       ├── permissions.py  # Assessment permission management
│   │   │       ├── assessment.py   # Start/resume/submit assessment session
│   │   │       └── scores.py       # Score retrieval
│   │   ├── services/
│   │   │   ├── scale_engine.py   # Python score calculator (branching, subscales)
│   │   │   ├── allocation.py     # Doctor–patient auto-allocation logic
│   │   │   └── notification.py   # Notification helpers
│   │   └── utils/
│   │       ├── responses.py      # success_response, paginated_response helpers
│   │       └── exceptions.py     # ForbiddenError, NotFoundError
│   ├── scripts/
│   │   └── seed_scales.py    # Seed PRS scales into DB
│   ├── tests/
│   │   └── test_scale_engine.py
│   ├── requirements.txt
│   └── .env                  # Never commit — see .env.example
│
└── frontend/                 # React + Vite application
    ├── src/
    │   ├── main.jsx          # React DOM entry
    │   ├── App.jsx           # Router, protected routes, role redirects
    │   ├── lib/
    │   │   ├── supabase.js   # Supabase browser client
    │   │   └── api.js        # Axios instance (auto Bearer token, 401 handler)
    │   ├── store/
    │   │   ├── authStore.js  # Zustand: login, register, logout, init
    │   │   ├── prsStore.js   # Zustand: scales, assessment state
    │   │   └── uiStore.js    # Zustand: global UI state
    │   ├── hooks/
    │   │   └── useAuth.js    # Auth state convenience hook
    │   ├── components/
    │   │   ├── common/
    │   │   │   ├── LoadingSpinner.jsx
    │   │   │   └── ProtectedRoute.jsx   # Role-based route guard
    │   │   ├── layout/
    │   │   │   ├── DoctorLayout.jsx
    │   │   │   ├── PatientLayout.jsx
    │   │   │   └── Navbar.jsx
    │   │   └── prs/
    │   │       ├── ScaleRunner.jsx      # Assessment flow controller
    │   │       ├── QuestionRenderer.jsx # Renders single question + options
    │   │       └── ScoreCard.jsx        # Displays score result
    │   └── pages/
    │       ├── auth/
    │       │   ├── LoginPage.jsx
    │       │   └── RegisterPage.jsx
    │       ├── doctor/
    │       │   ├── DoctorDashboard.jsx  # Stats, recent assessments
    │       │   ├── PatientList.jsx      # All patients table with search
    │       │   └── PatientDetail.jsx    # Tabs: overview, assessments, scores
    │       ├── patient/
    │       │   ├── PatientDashboard.jsx
    │       │   ├── MyAssessments.jsx
    │       │   └── MyScores.jsx
    │       └── prs/
    │           └── AssessmentPage.jsx   # Full assessment runner page
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## Backend Setup

### 1. Create and activate virtual environment

```bash
cd neurowellness/backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Create `.env`

Copy the template and fill in your Supabase credentials:

```bash
cp .env.example .env
```

```env
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_KEY=sb_publishable_<your-anon-key>
SUPABASE_SERVICE_KEY=sb_secret_<your-service-role-key>
JWT_SECRET=<JWT secret from Supabase Settings → API → JWT Settings>
ENVIRONMENT=development
ALLOWED_ORIGINS=["http://localhost:5173", "http://localhost:3000"]
API_PREFIX=/api/v1
```

> **Never commit `.env`** — the service role key has full DB access and bypasses RLS.

### 4. Run the server

```bash
uvicorn app.main:app --reload
```

API available at: `http://localhost:8000`
Interactive docs: `http://localhost:8000/docs`

---

## Frontend Setup

### 1. Install dependencies

```bash
cd neurowellness/frontend
npm install
```

### 2. Create `.env`

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_<your-anon-key>
VITE_API_URL=http://localhost:8000/api/v1
```

### 3. Run the dev server

```bash
npm run dev
```

Frontend available at: `http://localhost:5173`

---

## Authentication Flow

```
1. User registers → supabase.auth.signUp()
2. Frontend gets session token → POST /api/v1/auth/sync-profile (creates profile row)
3. User logs in → supabase.auth.signInWithPassword()
4. Every API request → Authorization: Bearer <JWT> header
5. Backend validates token via Supabase Admin API → loads profile from DB
6. Role-based access: require_doctor dependency guards doctor-only endpoints
```

---

## API Endpoints

### Auth
| Method | Path                      | Description                        |
|--------|---------------------------|------------------------------------|
| POST   | `/auth/sync-profile`      | Create/update profile after signUp |
| GET    | `/auth/me`                | Get current user profile           |

### Doctors
| Method | Path                                         | Description                    |
|--------|----------------------------------------------|--------------------------------|
| GET    | `/doctors/dashboard`                         | Stats + recent assessments     |
| GET    | `/doctors/patients`                          | All patients (paginated)       |
| GET    | `/doctors/patients/{id}`                     | Patient detail + permissions   |
| POST   | `/doctors/patients/{id}/grant-assessment`    | Grant a scale to a patient     |
| PUT    | `/doctors/availability`                      | Update doctor availability     |

### Patients
| Method | Path                      | Description                    |
|--------|---------------------------|--------------------------------|
| GET    | `/patients/dashboard`     | Dashboard data                 |
| GET    | `/patients/my-doctor`     | Assigned doctor info           |
| GET    | `/patients/my-assessments`| Granted assessments            |
| GET    | `/patients/my-scores`     | Historical scores              |

### PRS
| Method | Path                              | Description                        |
|--------|-----------------------------------|------------------------------------|
| GET    | `/prs/scales`                     | List all scales                    |
| GET    | `/prs/scales/{id}/questions`      | Questions + options + branching    |
| POST   | `/prs/assessment/start`           | Start assessment session           |
| POST   | `/prs/assessment/{id}/submit`     | Submit responses → calculate score |
| GET    | `/prs/scores/patient/{id}`        | Patient score history              |

---

## Doctor–Patient Allocation

When a patient registers, the system automatically assigns the best available doctor:

1. **Same city** → pick doctor with fewest current patients
2. **Same state** (fallback) → pick doctor with fewest current patients
3. **Any available doctor** (final fallback)

The allocation is logged in `doctor_patient_allocations` and `patients.assigned_doctor_id` is updated.

---

## PRS Scale Engine

The score calculator lives in `backend/app/services/scale_engine.py`.

It supports:
- **Branching logic** — skip questions based on previous answers
- **Subscale scoring** — grouped sub-scores within a single scale
- **Severity mapping** — maps total score ranges to severity labels (minimal / mild / moderate / severe)
- **Max possible score** — calculated dynamically after branching

---

## Frontend Routes

| Path                          | Role      | Page                        |
|-------------------------------|-----------|-----------------------------|
| `/login`                      | Public    | Login                       |
| `/register`                   | Public    | Register (Doctor / Patient) |
| `/doctor/dashboard`           | Doctor    | Dashboard                   |
| `/doctor/patients`            | Doctor    | Patient list                |
| `/doctor/patients/:id`        | Doctor    | Patient detail              |
| `/patient/dashboard`          | Patient   | Dashboard                   |
| `/patient/assessments`        | Patient   | My assessments              |
| `/patient/scores`             | Patient   | My scores                   |
| `/assessment`                 | Both      | Take assessment             |

---

## Database Tables (Key)

| Table                        | Purpose                                      |
|------------------------------|----------------------------------------------|
| `profiles`                   | All users — id, role, full_name, city, state |
| `doctors`                    | Doctor-specific data + availability          |
| `patients`                   | Patient data + assigned_doctor_id            |
| `doctor_patient_allocations` | Allocation audit log                         |
| `prs_scales`                 | Assessment scales metadata                  |
| `prs_questions`              | Questions per scale                          |
| `prs_options`                | Answer options with scores + branching       |
| `assessment_permissions`     | Which patient can take which scale           |
| `assessment_sessions`        | Active/completed assessment sessions         |
| `assessment_responses`       | Individual question responses                |
| `assessment_scores`          | Calculated scores per session                |
| `notifications`              | In-app notifications                         |
