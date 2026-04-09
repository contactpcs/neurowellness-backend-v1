# NeuroWellness Database Schema v6.0.0 — Master Documentation

**Last Updated:** April 2026  
**Version:** 6.0.0 (PATCHED from v5)  
**Status:** Full Supabase PostgreSQL Schema

---

## 📋 Executive Summary

This is a **healthcare-grade PostgreSQL schema** for a neurological assessment platform with:
- ✅ **Multi-role user management** (patient, doctor, admin, receptionist, clinical_assistant)
- ✅ **Patient-Reported Scales (PRS) engine** — 14 neurological diseases × 40+ assessment instruments
- ✅ **Row-Level Security (RLS)** — fine-grained access control
- ✅ **Automated scoring** — triggers calculate results on response submission
- ✅ **Full audit trail** — all critical actions logged

---

## 🔑 Key Changes in v6

| Change | v5 | v6 |
|--------|----|----|
| **Scoring Rules Table** | ✅ Exists | ❌ Removed |
| **PRS IDs** | UUID | **TEXT (composite keys)** |
| **Score Calculation** | DB-driven | **Application code** |
| **Final Results** | Manual | **Auto-triggered on completion** |

---

## 📊 Schema Architecture

### **Part 1: Base Tables (7 tables)**
Core user management and clinical sessions.

```
┌─────────────────────────────────────────┐
│  profiles (root)                        │
│  - Unified user account (auth.users FK) │
│  - Roles: patient|doctor|admin|...      │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┼──────────┬─────────────────────┐
    │          │          │                     │
    ▼          ▼          ▼                     ▼
 doctors   patients  receptionists    clinical_assistants
 ─────────────────────────────────────────────────────────
 - Specialization    - Medical history   - Employee ID
 - License #         - Emergency contact - Department
 - Hospital          - Assigned doctor   - Supervising doctor
 - Availability      (FK → doctors)      (FK → doctors)
```

**Supporting Tables:**
- `sessions` → Links patient + doctor for clinical visits
- `doctor_patient_allocations` → Historical doctor-patient relationships
- `notifications` → In-app alerts for all users
- `audit_logs` → Immutable system action log

---

### **Part 2: PRS Assessment Schema (12 tables)**
Patient-Reported Scales assessment engine. **v6: All IDs are TEXT composite keys.**

```
┌──────────────────────┐
│  prs_diseases (14)   │  Disease_ID: "CHRONICPAIN/2026"
│  - Chronic Pain      │
│  - Depression/Anxiety│
│  - Migraine          │
│  - ... etc ...       │
└──────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  prs_disease_scale_map               │  Map_ID: "ChronicPain/EQ-5D-5L"
│  Links diseases → scales              │  (ordered for each disease)
│  - Display order                      │
│  - Is_required flag                   │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────┐
│  prs_scales (40+)    │  Scale_ID: "EQ-5D-5L/2026"
│  - EQ-5D-5L          │
│  - BDI-II            │
│  - DASS-21           │
│  - ... etc ...       │
└──────────────────────┘
         │
         ├─────────────────────────┬──────────────────┐
         ▼                         ▼                  ▼
┌──────────────────────┐  ┌──────────────────┐  ┌────────────────┐
│  prs_questions       │  │  prs_options     │  │  prs_scale_    │
│  Question_ID:        │  │  Option_ID:      │  │  question_map  │
│  "EQ-5D-5L/001"      │  │  "EQ-5D-5L/001/ │  │  Reorders Qs   │
│  - Question text     │  │   01"            │  │  for each scale│
│  - Answer type       │  │  - Label         │  │                │
│  - Skip logic        │  │  - Value & Points│  │                │
└──────────────────────┘  └──────────────────┘  └────────────────┘
```

**Runtime Flow:**
```
Doctor grants permission
       ↓
Patient starts assessment instance
       ↓
Patient answers each question → prs_responses
       ↓
Application calculates scale scores → INSERT prs_scale_results
       ↓
[TRIGGER] recalculate_final_result fires
       ↓
prs_final_results auto-created + instance marked 'completed'
```

---

## 📑 Table Reference

### **Base Tables**

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `profiles` | All authenticated users | `id` (UUID, auth FK), `role`, `full_name`, `email`, `avatar_url` |
| `doctors` | Doctor-specific data | `id` (FK→profiles), `specialization`, `license_number`, `availability` |
| `patients` | Patient-specific data | `id` (FK→profiles), `assigned_doctor_id`, `medical_history` |
| `receptionists` | Receptionist staff | `id` (FK→profiles), `employee_id`, `department` |
| `clinical_assistants` | Clinical staff | `id` (FK→profiles), `supervising_doctor_id` |
| `admins` | Admin staff | `id` (FK→profiles), `employee_id`, `department` |
| `sessions` | Clinical visits | `id` (UUID), `patient_id`, `doctor_id`, `session_date`, `status` |
| `doctor_patient_allocations` | Assignment history | `allocation_id`, `doctor_id`, `patient_id`, `allocated_at`, `deallocated_at` |
| `notifications` | In-app alerts | `id`, `user_id`, `title`, `body`, `is_read`, `created_at` |
| `audit_logs` | System audit trail | `log_id`, `actor_id`, `action`, `table_name`, `old_data`, `new_data` |

### **PRS Reference Tables (Read-Only for Users)**

| Table | Purpose | Sample Data |
|-------|---------|------------|
| `prs_diseases` | Supported neurological conditions | 14 diseases (Depression/Anxiety, Chronic Pain, Dementia, etc.) |
| `prs_scales` | Assessment instruments | 40+ scales (EQ-5D-5L, BDI-II, DASS-21, etc.) |
| `prs_disease_scale_map` | Which scales per disease | Chronic Pain uses 8 scales in order |
| `prs_questions` | Question text & metadata | ~500+ unique questions |
| `prs_options` | Answer choices per question | Likert scales, sliders, multiple choice |
| `prs_scale_question_map` | Question order within scale | EQ-5D-5L has 5 questions in sequence |
| `prs_disease_question_map` | Flat disease→question lookup | Quick joins for UI rendering |

### **PRS Runtime Tables (Populated During Assessment)**

| Table | Purpose | Uniqueness | Key Columns |
|-------|---------|-----------|------------|
| `assessment_permissions` | Doctor approval for patient assessment | `(patient_id, scale_id, session_id)` UNIQUE | `status` (pending/granted/revoked/completed) |
| `prs_assessment_instances` | One assessment "session" | `instance_id` (TEXT) PRIMARY KEY | `instance_id` = "PAT001/001", `status`, `final_result` FK |
| `prs_responses` | Patient's raw answers | `(instance_id, question_id)` UNIQUE | `given_response`, `response_value` |
| `prs_scale_results` | Computed score per scale | `(instance_id, scale_id)` UNIQUE | `calculated_value`, `percentage` (auto), `severity_level` |
| `prs_final_results` | Aggregate disease result | `instance_id` UNIQUE (1:1) | `final_result_id` = "PAT001/001/CHRONICPAIN/2026" |

---

## 🔐 Row-Level Security (RLS) Policies

### **By Table Category**

#### **Profile Tables** (patient, doctor, admin roles)
```
✓ Users can see: own profile + their assigned doctor (if patient) / patients (if doctor)
✓ Users can update: own profile only
✗ Users cannot: see other users' PII
```

#### **Session & Allocation**
```
✓ Patient: sees own sessions only
✓ Doctor: sees sessions with own patients only
✗ Cross-doctor access: blocked
```

#### **PRS Reference Tables** (prs_diseases, prs_scales, prs_questions, etc.)
```
✓ Authenticated users: can read all (to render UI)
✗ Anonymous: no access
```

#### **PRS Assessment Runtime**
```
✓ Patient:
  - Sees own instances only
  - Can create own instance
  - Can insert own responses (within instance)

✓ Doctor:
  - Sees own patients' instances
  - Can create instances on behalf of patients
  - Can read patient responses & results

✗ Patient cannot:
  - See other patients' data
  - Tamper with responses after submission
```

---

## ⚙️ Automatic Calculations & Triggers

### **Trigger 1: `update_updated_at_column()`**
```sql
BEFORE UPDATE ON prs_scales
  → Sets NEW.updated_at = NOW()
```

### **Trigger 2: `recalculate_final_result()` (CRITICAL)**
```sql
AFTER INSERT OR UPDATE ON prs_scale_results
  FOR EACH ROW EXECUTE recalculate_final_result()

Actions:
  1. Fetches all scale_results for this instance
  2. Aggregates: total_score, max_possible, worst_severity
  3. Builds scale_summaries & all_risk_flags (JSONB)
  4. UPSERT into prs_final_results with auto-calculated percentage
  5. IF all scales done: mark instance as 'completed' + backfill final_result FK
```

**Example Output:**
```json
{
  "final_result_id": "PAT001/001/CHRONICPAIN/2026",
  "instance_id": "PAT001/001",
  "calculated_value": 42,
  "max_possible": 100,
  "percentage": 42.00,
  "scales_completed": 6,
  "scales_total": 6,
  "overall_severity": "moderate",
  "scale_summaries": [
    {
      "scale_code": "EQ-5D-5L",
      "score": 15,
      "percentage": 75.00,
      "severity_level": "mild"
    },
    ...
  ],
  "all_risk_flags": [
    "heightened_pain_sensitivity",
    "sleep_disturbance"
  ]
}
```

---

## 📋 Composite Key Format (v6 IDs)

All PRS IDs are **human-readable TEXT** combining semantic components:

| Entity | Format | Example |
|--------|--------|---------|
| **Disease** | `{DISEASECODE}/{YEAR}` | `CHRONICPAIN/2026` |
| **Scale** | `{SCALECODE}/{YEAR}` | `EQ-5D-5L/2026` |
| **Disease-Scale Map** | `{DiseaseName}/{ScaleCode}` | `Chronic Pain/EQ-5D-5L` |
| **Question** | `{SCALECODE}/{QUESTIONNUMBER}` | `EQ-5D-5L/001` |
| **Option** | `{QUESTIONID}/{OPTIONNUMBER}` | `EQ-5D-5L/001/01` |
| **Assessment Instance** | `{PATIENTCODE}/{INSTANCENUMBER}` | `PAT001/001` |
| **Response** | `{INSTANCEID}/{RESPONSESNUMBER}` | `PAT001/001/0006` |
| **Scale Result** | `{INSTANCEID}/{SCALEID}` | `PAT001/001/EQ-5D-5L/2026` |
| **Final Result** | `{INSTANCEID}/{DISEASEID}` | `PAT001/001/CHRONICPAIN/2026` |

**Benefits:**
- ✅ Human-readable in logs & debugging
- ✅ Eliminates need for separate ID-generation service
- ✅ Fully traceable audit trail
- ✅ Backward-compatible if migrating data

---

## 🗄️ Performance Indexes

### **Coverage**
- **35+ indexes** on high-cardinality columns
- Covers: foreign keys, status fields, frequently-joined columns, date ranges

### **Critical Indexes**
```sql
idx_prs_dsmap_order          — disease_id, display_order (query scales for disease)
idx_prs_sqmap_order          — scale_id, display_order (load questions for scale)
idx_pai_patient              — patient_id (get all patient assessments)
idx_psr_instance             — instance_id (load all responses for assessment)
idx_pfr_instance             — instance_id (fetch final results)
```

---

## 📊 Seed Data Included

### **Diseases (14 total)**
```
✓ Depression/Anxiety
✓ Chronic Pain
✓ Fibromyalgia
✓ Migraine
✓ Ataxia
✓ After Stroke/TBI
✓ Dementia
✓ Parkinson's Disease
✓ Tinnitus
✓ Insomnia
✓ Multiple Sclerosis
✓ ADHD
✓ ALS
✓ Irritable Bowel Disease
```

### **Scales (40+Total)**
| Type | Examples | Count |
|------|----------|-------|
| **Common Scales** (used 2+ diseases) | EQ-5D-5L, DASS-21, COMPASS-31, BDI-II, GAD-7, MoCA | 6 |
| **Disease-Specific** | PFS-16 (Parkinson's), THI (Tinnitus), SARA (Ataxia) | 34 |

### **Disease-Scale Mapping**
```
Depression/Anxiety      → 7 scales (comprehensive assessment)
Chronic Pain           → 8 scales
Insomnia              → 9 scales (most scales)
ADHD                  → 5 scales
Dementia              → 8 scales
... etc
```

---

## 🔄 Common Queries

### **Q1: Get all scales for a disease**
```sql
SELECT ds.scale_code, ds.scale_name
FROM prs_disease_scale_map dsm
JOIN prs_scales ds ON dsm.scale_id = ds.scale_id
WHERE dsm.disease_id = 'CHRONICPAIN/2026'
ORDER BY dsm.display_order;
```

### **Q2: Get questions for a scale**
```sql
SELECT q.question_id, q.question_text
FROM prs_scale_question_map sqm
JOIN prs_questions q ON sqm.question_id = q.question_id
WHERE sqm.scale_id = 'EQ-5D-5L/2026'
ORDER BY sqm.display_order;
```

### **Q3: Get patient's assessment results**
```sql
SELECT 
  pai.instance_id,
  pai.disease_id,
  psr.scale_id,
  psr.calculated_value,
  psr.percentage,
  psr.severity_level
FROM prs_assessment_instances pai
LEFT JOIN prs_scale_results psr ON pai.instance_id = psr.instance_id
WHERE pai.patient_id = $patient_uuid
ORDER BY pai.started_at DESC;
```

### **Q4: Get final assessment result**
```sql
SELECT 
  pfr.final_result_id,
  pfr.overall_severity,
  pfr.percentage,
  pfr.scale_summaries,
  pfr.all_risk_flags
FROM prs_final_results pfr
WHERE pfr.instance_id = 'PAT001/001';
```

### **Q5: Doctor sees patient's permission status**
```sql
SELECT 
  ap.status,
  ds.disease_id,
  ap.expires_at,
  ap.notes
FROM assessment_permissions ap
JOIN prs_diseases ds ON ap.disease_id = ds.disease_id
WHERE ap.patient_id = $patient_uuid
  AND ap.doctor_id = $doctor_uuid
  AND ap.scale_id = 'EQ-5D-5L/2026';
```

---

## ⚠️ Important Notes

### **Constraints & Best Practices**

| Constraint | Violation | Impact |
|-----------|-----------|--------|
| **RLS Active** | Bypass with `SET session_user = ...` | Can read/update rows outside policy |
| **scoring_rule_id Removed** | Application tries to insert into old field | ❌ FOREIGN KEY ERROR (field doesn't exist) |
| **TEXT IDs** | Generating overlapping composite keys | ❌ UNIQUE constraint violation |
| **Deferred FK** | Trying to read final_result before trigger fires | Null value (normal in-progress) |
| **Trigger Logic** | Manually updating prs_scale_results.calculated_value | Trigger re-calculates immediately |

### **v6 Migration Checklist**
```
✓ Removed prs_scoring_rules table
✓ Removed scoring_rule_id from: prs_scales, prs_disease_scale_map, 
                                prs_scale_results, prs_final_results
✓ Changed all IDs from UUID to TEXT (composite keys)
✓ Updated triggers to use TEXT keys
✓ Updated RLS policies to expect new ID format
✓ Re-seeded all reference data with new key format
✓ Tested trigger on scale result insert
⚠ BACKEND MUST: Stop inserting scoring_rule_id
⚠ BACKEND MUST: Use TEXT composite IDs (not UUIDs) for PRS entities
```

---

## 🚀 Deployment Steps

### **1. Fresh Supabase Project**
```bash
# Copy entire SQL file → Supabase Dashboard → SQL Editor
# Run all at once (one shot, do not split)
# Expected: ~80 statements, 0 errors, 19 tables created
```

### **2. Verify Installation**
```sql
-- Check table count
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';  -- Should be ≥ 19

-- Check RLS status
SELECT tablename, rowsecurity 
FROM pg_tables WHERE schemaname = 'public' 
ORDER BY tablename;  -- All should be TRUE

-- Check seed data
SELECT COUNT(*) FROM prs_diseases;  -- Should be 14
SELECT COUNT(*) FROM prs_scales;    -- Should be 40+
```

### **3. Enable Realtime** (Optional)
```sql
-- For live notifications in frontend
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE prs_assessment_instances;
```

---

## 📞 Support & Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `relation "prs_scoring_rules" does not exist` | v5 code still inserting scoring_rule_id | Remove from backend INSERT statements |
| `unique constraint violation on ds_map_id` | Trying to insert duplicate disease-scale pair | Check UNIQUE (disease_id, scale_id) |
| Final result is NULL after INSERT | Trigger didn't fire, or incomplete scales | Check prs_scale_results count vs. scales_total |
| RLS blocks patient from own data | Wrong policy condition | Verify `patient_id = auth.uid()` (not `=` typo) |
| Slow assessment query | Missing index on disease_id | Most indexes auto-created; check idx_pai_patient |

---

## 📖 Quick Start Code

### **Backend: Create Assessment Instance**
```python
# Python/FastAPI
instance_id = f"PAT{patient_id[:3].upper()}/001"
result = supabase.table("prs_assessment_instances").insert({
    "instance_id": instance_id,
    "disease_id": "CHRONICPAIN/2026",
    "patient_id": patient_uuid,
    "initiated_by": "patient",
    "status": "in_progress"
}).execute()
```

### **Backend: Save Response & Trigger Scoring**
```python
# Insert response
supabase.table("prs_responses").insert({
    "response_id": "PAT001/001/0001",
    "instance_id": "PAT001/001",
    "question_id": "EQ-5D-5L/001",
    "given_response": "3",
    "response_value": 3.0
}).execute()

# ... repeat for all questions ...

# After all questions, calculate scale score
calculated_score = calculate_eq5d5l_score(all_responses)
supabase.table("prs_scale_results").insert({
    "scale_result_id": "PAT001/001/EQ-5D-5L/2026",
    "instance_id": "PAT001/001",
    "scale_id": "EQ-5D-5L/2026",
    "calculated_value": calculated_score,
    "max_possible": 100,
    "severity_level": "moderate"
}).execute()

# ✅ Trigger auto-fires, final_results created, instance marked complete
```

### **Frontend: Display Results**
```javascript
// Fetch final result
const { data } = await supabase
  .from('prs_final_results')
  .select('*')
  .eq('instance_id', 'PAT001/001')
  .single();

// data.scale_summaries = [{ scale_code, score, percentage, severity_level }, ...]
// data.all_risk_flags = ["flag1", "flag2", ...]
```

---

## 📝 License & Attribution

**Schema Design:** NeuroWellness v6.0.0  
**Based On:** PRS_DET.xlsx (14 diseases, 40+ clinical scales)  
**Database:** PostgreSQL 13+ on Supabase

---

**Happy Assessing!** 🧠

