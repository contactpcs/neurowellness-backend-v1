import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import PatientLayout from '../../components/layout/PatientLayout'
import DoctorLayout from '../../components/layout/DoctorLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

// ── palette ──────────────────────────────────────────────────────────────────
const C = {
  orange:    '#F47920',
  orangeL:   '#FEF3E8',
  orangeBdr: '#F9C38A',
  navy:      '#0f172a',
  slate:     '#64748b',
  border:    '#e2e8f0',
  white:     '#ffffff',
  green:     '#16a34a',
  greenL:    '#f0fdf4',
  greenBdr:  '#86efac',
  red:       '#dc2626',
  redL:      '#fef2f2',
  gray:      '#f8fafc',
}

const S = {
  page:      { maxWidth: '860px', margin: '0 auto', padding: '0 0 60px' },
  banner:    { background: C.orangeL, border: `1.5px solid ${C.orangeBdr}`, borderRadius: '12px',
               padding: '20px 24px', marginBottom: '28px', display: 'flex',
               alignItems: 'center', gap: '14px' },
  bannerIcon:{ fontSize: '28px' },
  bannerTitle:{ fontSize: '20px', fontWeight: '700', color: C.navy, marginBottom: '2px' },
  bannerSub: { fontSize: '13px', color: C.slate },
  doneBanner:{ background: C.greenL, border: `1.5px solid ${C.greenBdr}`, borderRadius: '12px',
               padding: '16px 24px', marginBottom: '28px', display: 'flex',
               alignItems: 'center', gap: '12px', color: C.green, fontSize: '14px', fontWeight: '600' },
  section:   { background: C.white, borderRadius: '12px', padding: '24px',
               boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' },
  secHead:   { fontSize: '16px', fontWeight: '700', color: C.navy, paddingBottom: '14px',
               borderBottom: `2px solid ${C.orange}`, marginBottom: '20px',
               display: 'flex', alignItems: 'center', gap: '10px' },
  secNum:    { background: C.orange, color: C.white, borderRadius: '50%',
               width: '26px', height: '26px', display: 'flex', alignItems: 'center',
               justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 },
  group:     { marginBottom: '20px' },
  label:     { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151',
               marginBottom: '8px' },
  required:  { color: C.red, marginLeft: '3px' },
  helper:    { fontSize: '11px', color: C.slate, marginTop: '4px' },
  input:     { width: '100%', padding: '10px 12px', border: `1.5px solid ${C.border}`,
               borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit',
               outline: 'none', boxSizing: 'border-box', transition: 'border-color .2s' },
  textarea:  { width: '100%', padding: '10px 12px', border: `1.5px solid ${C.border}`,
               borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
               minHeight: '90px', outline: 'none', boxSizing: 'border-box' },
  select:    { width: '100%', padding: '10px 12px', border: `1.5px solid ${C.border}`,
               borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit',
               outline: 'none', background: C.white, cursor: 'pointer', boxSizing: 'border-box' },
  radioWrap: { display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '6px' },
  radioItem: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
               fontSize: '13px', color: '#374151' },
  checkWrap: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
               gap: '10px', marginTop: '6px' },
  checkItem: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
               fontSize: '13px', color: '#374151' },
  footer:    { display: 'flex', justifyContent: 'flex-end', gap: '12px',
               padding: '20px 24px', background: C.white, borderRadius: '12px',
               boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginTop: '8px' },
  btnPrimary:{ background: C.orange, color: C.white, border: 'none', borderRadius: '8px',
               padding: '12px 32px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },
  btnDisabled:{ background: '#d1d5db', color: C.white, border: 'none', borderRadius: '8px',
                padding: '12px 32px', fontSize: '14px', fontWeight: '700', cursor: 'not-allowed' },
  savingBadge:{ fontSize: '12px', color: C.slate, alignSelf: 'center' },
  error:     { background: C.redL, border: `1px solid #fca5a5`, borderRadius: '8px',
               padding: '14px 18px', color: C.red, fontSize: '13px', marginBottom: '20px' },
  readTag:   { display: 'inline-block', background: C.greenL, color: C.green,
               border: `1px solid ${C.greenBdr}`, borderRadius: '20px',
               padding: '2px 10px', fontSize: '11px', fontWeight: '600', marginLeft: '8px' },
  metaRow:   { display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px',
               color: C.slate, marginBottom: '24px', paddingBottom: '16px',
               borderBottom: `1px solid ${C.border}` },
  metaItem:  { display: 'flex', flexDirection: 'column', gap: '2px' },
  metaLabel: { fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
               letterSpacing: '0.5px', color: '#94a3b8' },
  metaValue: { fontWeight: '600', color: C.navy },
}

// ── section icon map ──────────────────────────────────────────────────────────
const SEC_ICON = { 1:'📋', 2:'⚡', 3:'📝', 4:'🔪', 5:'💊', 6:'💉', 7:'🧠', 8:'⚡' }

// ── helpers ───────────────────────────────────────────────────────────────────
function groupBySection(questions) {
  const map = {}
  for (const q of questions) {
    const k = q.section_number
    if (!map[k]) map[k] = { number: k, title: q.section_title, questions: [] }
    map[k].questions.push(q)
  }
  return Object.values(map).sort((a, b) => a.number - b.number)
}

function isVisible(q, responses) {
  if (!q.depends_on_question_id) return true
  const parentVal = responses[q.depends_on_question_id]?.value
  return parentVal === q.depends_on_value
}

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── question renderer ─────────────────────────────────────────────────────────
function QuestionField({ q, response, onChange, readOnly }) {
  const val    = response?.value  || ''
  const vals   = response?.values || []
  const focusStyle = { borderColor: C.orange }

  if (q.answer_type === 'radio') {
    return (
      <div style={S.radioWrap}>
        {q.options.map(o => (
          <label key={o.option_value} style={S.radioItem}>
            <input type="radio" name={q.question_id}
              value={o.option_value}
              checked={val === o.option_value}
              disabled={readOnly}
              onChange={() => !readOnly && onChange(q.question_id, o.option_value, null)}
            />
            {o.option_label}
          </label>
        ))}
      </div>
    )
  }

  if (q.answer_type === 'select') {
    return (
      <select style={S.select} value={val} disabled={readOnly}
        onChange={e => onChange(q.question_id, e.target.value, null)}>
        <option value="">Select an option…</option>
        {q.options.map(o => (
          <option key={o.option_value} value={o.option_value}>{o.option_label}</option>
        ))}
      </select>
    )
  }

  if (q.answer_type === 'checkbox') {
    const toggle = (v) => {
      if (readOnly) return
      const next = vals.includes(v) ? vals.filter(x => x !== v) : [...vals, v]
      onChange(q.question_id, null, next)
    }
    return (
      <div style={S.checkWrap}>
        {q.options.map(o => (
          <label key={o.option_value} style={S.checkItem}>
            <input type="checkbox"
              checked={vals.includes(o.option_value)}
              disabled={readOnly}
              onChange={() => toggle(o.option_value)}
            />
            {o.option_label}
          </label>
        ))}
      </div>
    )
  }

  if (q.answer_type === 'textarea') {
    return (
      <textarea style={S.textarea} value={val} readOnly={readOnly}
        placeholder={readOnly ? '' : (q.helper_text || '')}
        onChange={e => onChange(q.question_id, e.target.value, null)}
        onFocus={e => { if (!readOnly) e.target.style.borderColor = C.orange }}
        onBlur={e => e.target.style.borderColor = C.border}
      />
    )
  }

  // text / conditional_text / default
  return (
    <input style={S.input} type="text" value={val} readOnly={readOnly}
      placeholder={readOnly ? '' : (q.helper_text || '')}
      onChange={e => onChange(q.question_id, e.target.value, null)}
      onFocus={e => { if (!readOnly) e.target.style.borderColor = C.orange }}
      onBlur={e => e.target.style.borderColor = C.border}
    />
  )
}

// ── main component ────────────────────────────────────────────────────────────
export default function AnamnesisPage() {
  const { user, role } = useAuthStore()
  const { patientId }  = useParams()          // set when doctor views /doctor/patients/:id/anamnesis
  const navigate       = useNavigate()

  const isDoctor  = role !== 'patient'
  const targetId  = isDoctor ? patientId : user?.id

  const [questions,    setQuestions]    = useState([])
  const [sections,     setSections]     = useState([])
  const [responses,    setResponses]    = useState({})   // { question_id: { value, values } }
  const [anamnesisId,  setAnamnesisId]  = useState(null)
  const [status,       setStatus]       = useState(null) // null | 'in_progress' | 'completed'
  const [meta,         setMeta]         = useState(null) // { completed_at, taken_by }
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState('')

  const saveTimer = useRef(null)

  // ── initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!targetId) return
    Promise.all([
      api.get('/anamnesis/questions'),
      isDoctor
        ? api.get(`/anamnesis/patient/${targetId}`).catch(e => e.response?.status === 404 ? null : Promise.reject(e))
        : api.get('/anamnesis/me').catch(e => e.response?.status === 404 ? null : Promise.reject(e)),
    ])
      .then(([qRes, aRes]) => {
        const qs = qRes.data.data || []
        setQuestions(qs)
        setSections(groupBySection(qs))

        if (aRes) {
          const a = aRes.data.data
          setAnamnesisId(a.anamnesis_id)
          setStatus(a.status)
          setMeta({ completed_at: a.completed_at, taken_by: a.taken_by })
          // hydrate responses from stored answers
          const init = {}
          for (const r of (a.responses || [])) {
            init[r.question_id] = { value: r.response_value || '', values: r.response_values || [] }
          }
          setResponses(init)
        }
      })
      .catch(() => setError('Failed to load anamnesis. Please refresh.'))
      .finally(() => setLoading(false))
  }, [targetId, isDoctor])

  // ── start if patient has no record ─────────────────────────────────────────
  useEffect(() => {
    if (loading || isDoctor || status !== null) return
    api.post('/anamnesis/start', { taken_by: 'patient' })
      .then(r => {
        setAnamnesisId(r.data.data.anamnesis_id)
        setStatus('in_progress')
      })
      .catch(() => setError('Failed to start anamnesis. Please refresh.'))
  }, [loading, isDoctor, status])

  // ── response change + auto-save ─────────────────────────────────────────────
  const handleChange = useCallback((questionId, value, values) => {
    if (status === 'completed') return
    setResponses(prev => ({ ...prev, [questionId]: { value: value ?? '', values: values ?? [] } }))

    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!anamnesisId) return
      setSaving(true)
      try {
        await api.post('/anamnesis/save-response', {
          anamnesis_id:    anamnesisId,
          question_id:     questionId,
          response_value:  value   ?? null,
          response_values: values  ?? null,
        })
      } catch { /* silent — will retry on submit */ }
      finally  { setSaving(false) }
    }, 600)
  }, [anamnesisId, status])

  // ── submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError('')
    // validate required visible questions
    const missing = questions.filter(q =>
      q.is_required && isVisible(q, responses) &&
      !responses[q.question_id]?.value && !(responses[q.question_id]?.values?.length)
    )
    if (missing.length) {
      setError(`Please answer all required questions before submitting. Missing: ${missing.map(q => `"${q.question_text.slice(0,40)}"`).join(', ')}`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setSubmitting(true)
    try {
      await api.post('/anamnesis/submit', { anamnesis_id: anamnesisId })
      setStatus('completed')
      setMeta(prev => ({ ...prev, completed_at: new Date().toISOString() }))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e.response?.data?.detail || 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── layouts ─────────────────────────────────────────────────────────────────
  const Layout = isDoctor ? DoctorLayout : PatientLayout

  if (loading) return <Layout><LoadingSpinner message="Loading anamnesis…" /></Layout>

  const readOnly    = isDoctor || status === 'completed'
  const justDone    = status === 'completed'

  return (
    <Layout>
      <div style={S.page}>

        {/* page header */}
        <div style={S.banner}>
          <span style={S.bannerIcon}>🩺</span>
          <div>
            <div style={S.bannerTitle}>
              Anamnesis Assessment
              {justDone && <span style={S.readTag}>✓ Completed</span>}
            </div>
            <div style={S.bannerSub}>Patient Symptoms &amp; Medical History</div>
          </div>
        </div>

        {/* completed notice */}
        {justDone && (
          <div style={S.doneBanner}>
            <span>✓</span>
            Anamnesis submitted on {fmt(meta?.completed_at)} — this record is now read-only.
            {!isDoctor && (
              <button
                style={{ marginLeft: 'auto', background: 'transparent', border: 'none',
                         color: C.green, cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}
                onClick={() => navigate('/patient/assessments')}
              >
                Go to Assessments →
              </button>
            )}
          </div>
        )}

        {/* meta row (completed view) */}
        {justDone && meta && (
          <div style={{ ...S.section, marginBottom: '20px' }}>
            <div style={S.metaRow}>
              <div style={S.metaItem}>
                <span style={S.metaLabel}>Completed On</span>
                <span style={S.metaValue}>{fmt(meta.completed_at)}</span>
              </div>
              <div style={S.metaItem}>
                <span style={S.metaLabel}>Filled By</span>
                <span style={S.metaValue}>{meta.taken_by === 'doctor_on_behalf' ? 'Doctor (on behalf)' : 'Patient'}</span>
              </div>
            </div>
          </div>
        )}

        {/* error */}
        {error && <div style={S.error}>{error}</div>}

        {/* sections */}
        {sections.map(sec => (
          <div key={sec.number} style={S.section}>
            <div style={S.secHead}>
              <div style={S.secNum}>{sec.number}</div>
              {SEC_ICON[sec.number]} {sec.title}
            </div>

            {sec.questions
              .filter(q => isVisible(q, responses))
              .map(q => (
                <div key={q.question_id} style={S.group}>
                  <label style={S.label}>
                    {q.question_text}
                    {q.is_required && !readOnly && <span style={S.required}>*</span>}
                  </label>
                  <QuestionField
                    q={q}
                    response={responses[q.question_id]}
                    onChange={handleChange}
                    readOnly={readOnly}
                  />
                  {q.helper_text && q.answer_type !== 'text' && q.answer_type !== 'textarea' && (
                    <div style={S.helper}>{q.helper_text}</div>
                  )}
                </div>
              ))}
          </div>
        ))}

        {/* submit footer — only for patient in_progress */}
        {!readOnly && (
          <div style={S.footer}>
            {saving && <span style={S.savingBadge}>💾 Auto-saving…</span>}
            <button
              style={submitting ? S.btnDisabled : S.btnPrimary}
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Submitting…' : '✓ Submit Anamnesis'}
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}
