import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { usePrsStore } from '../../store/prsStore'
import { useAuthStore } from '../../store/authStore'
import ScaleRunner from '../../components/prs/ScaleRunner'
import Navbar from '../../components/layout/Navbar'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const S = {
  wrap: { maxWidth: '800px', margin: '0 auto', padding: '32px 16px' },
  card: { background: '#fff', borderRadius: '12px', padding: '40px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', textAlign: 'center' },
  h1: { fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '10px' },
  sub: { color: '#6b7280', fontSize: '15px', marginBottom: '8px' },
  scaleList: { listStyle: 'none', padding: 0, margin: '24px 0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px' },
  scaleItem: (active, done) => ({
    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
    borderRadius: '8px', fontSize: '14px', fontWeight: active ? '700' : '500',
    background: active ? '#eef2ff' : done ? '#f0fdf4' : '#f9fafb',
    color: active ? '#4f46e5' : done ? '#16a34a' : '#6b7280',
    border: `1px solid ${active ? '#c7d2fe' : done ? '#bbf7d0' : '#e5e7eb'}`,
  }),
  dot: (active, done) => ({
    width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '12px', fontWeight: '700',
    background: active ? '#4f46e5' : done ? '#16a34a' : '#e5e7eb',
    color: active || done ? '#fff' : '#9ca3af',
  }),
  btnRow: { display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '28px', flexWrap: 'wrap' },
  btnPrimary: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 32px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
  btnSecondary: { background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '12px 24px', fontSize: '14px', cursor: 'pointer' },
  btnSkip: { background: '#fff', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', cursor: 'pointer' },
  scoreBox: { background: '#fff', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: '20px' },
  scoreNum: { fontSize: '56px', fontWeight: '800', color: '#111827', lineHeight: 1 },
  severityBadge: (color) => ({ display: 'inline-block', background: color + '20', color, borderRadius: '20px', padding: '6px 20px', fontWeight: '700', fontSize: '15px', marginTop: '12px' }),
  summaryCard: { background: '#fff', borderRadius: '12px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6', fontSize: '14px' },
  err: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '14px' },
  progress: { marginBottom: '20px' },
  progressLabel: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280', marginBottom: '6px' },
  progressBar: { background: '#e5e7eb', borderRadius: '4px', height: '6px' },
  progressFill: (pct) => ({ background: '#4f46e5', height: '6px', borderRadius: '4px', width: `${pct}%`, transition: 'width 0.4s' }),
}

const SEVERITY_COLORS = {
  minimal: '#16a34a', mild: '#ca8a04', moderate: '#ea580c',
  severe: '#dc2626', normal: '#16a34a', high: '#dc2626', default: '#6b7280',
}
const severityColor = (level) => SEVERITY_COLORS[level?.toLowerCase()] || SEVERITY_COLORS.default

const PHASE = { LOADING: 'loading', INTRO: 'intro', SCALE_INTRO: 'scale_intro', RUNNING: 'running', SCORE: 'score', DONE: 'done' }

export default function AssessmentPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { role } = useAuthStore()
  const {
    activeSession, submittedScore, completedScores, isLoading,
    startDiseaseAssessment, resetAssessment,
    advanceToNextScale, skipCurrentScale,
  } = usePrsStore()

  const [phase, setPhase] = useState(PHASE.LOADING)
  const [error, setError] = useState('')

  const diseaseId  = searchParams.get('disease_id')
  const patientId  = searchParams.get('patient_id')
  const takenBy    = (role === 'doctor' || role === 'clinical_assistant') && patientId
    ? 'doctor_on_behalf'
    : 'patient'

  // Derived from activeSession
  const scales         = activeSession?.scales || []
  const currentScaleIdx = activeSession?.currentScaleIndex ?? 0
  const currentScale   = scales[currentScaleIdx] || null
  const totalScales    = scales.length
  const progressPct    = totalScales ? Math.round((currentScaleIdx / totalScales) * 100) : 0
  const remaining      = scales.filter((s, i) => i > currentScaleIdx && !s.is_completed).length

  // On mount: start disease assessment
  useEffect(() => {
    if (!diseaseId) { navigate(-1); return }
    resetAssessment()
    startDiseaseAssessment(diseaseId, takenBy, patientId || null)
      .then(() => setPhase(PHASE.INTRO))
      .catch(e => {
        setError(e.response?.data?.detail || e.message || 'Failed to load assessment')
        setPhase(PHASE.INTRO)
      })
  }, [])

  const handleBeginDisease = () => setPhase(PHASE.SCALE_INTRO)

  const handleStartScale = () => {
    setError('')
    setPhase(PHASE.RUNNING)
  }

  const handleSkipScale = () => {
    setError('')
    const hasNext = skipCurrentScale()
    if (hasNext) {
      setPhase(PHASE.SCALE_INTRO)
    } else {
      setPhase(PHASE.DONE)
    }
  }

  // Called by ScaleRunner after it has already submitted the scale and received the score
  const handleScaleComplete = (_score) => {
    setError('')
    setPhase(PHASE.SCORE)
  }

  const handleNextAfterScore = () => {
    const hasNext = advanceToNextScale()
    if (hasNext) {
      setPhase(PHASE.SCALE_INTRO)
    } else {
      setPhase(PHASE.DONE)
    }
  }

  const handleDone = () => {
    resetAssessment()
    navigate(role === 'doctor' || role === 'clinical_assistant' ? -1 : '/patient/assessments')
  }

  const renderProgress = () => (
    <div style={S.progress}>
      <div style={S.progressLabel}>
        <span>Scale {currentScaleIdx + 1} of {totalScales}</span>
        <span>{progressPct}%</span>
      </div>
      <div style={S.progressBar}><div style={S.progressFill(progressPct)} /></div>
    </div>
  )

  // ── LOADING ───────────────────────────────────────────────
  if (phase === PHASE.LOADING || (isLoading && phase === PHASE.LOADING)) {
    return (
      <div>
        <Navbar />
        <div style={S.wrap}><LoadingSpinner message="Loading assessment..." /></div>
      </div>
    )
  }

  // ── INTRO ─────────────────────────────────────────────────
  if (phase === PHASE.INTRO) {
    return (
      <div>
        <Navbar />
        <div style={S.wrap}>
          <div style={S.card}>
            <h1 style={S.h1}>{activeSession?.disease_name || 'Assessment'}</h1>
            <p style={{ ...S.sub, marginBottom: '4px' }}>
              This assessment includes {totalScales} scale{totalScales !== 1 ? 's' : ''}.
            </p>
            <p style={{ ...S.sub, fontSize: '13px' }}>
              You can skip any scale if needed. Complete as many as you can.
            </p>

            {error && <div style={S.err}>{error}</div>}

            <ul style={S.scaleList}>
              {scales.map((sc, i) => (
                <li key={sc.scale_id} style={S.scaleItem(false, sc.is_completed)}>
                  <div style={S.dot(false, sc.is_completed)}>
                    {sc.is_completed ? '✓' : i + 1}
                  </div>
                  {sc.scale_name}
                  {sc.is_completed && (
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#16a34a', fontWeight: '600' }}>
                      Already completed
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <div style={S.btnRow}>
              <button style={S.btnSecondary} onClick={() => { resetAssessment(); navigate(-1) }}>
                Go Back
              </button>
              <button style={S.btnPrimary} onClick={handleBeginDisease} disabled={isLoading}>
                Begin Assessment
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── SCALE INTRO ───────────────────────────────────────────
  if (phase === PHASE.SCALE_INTRO) {
    return (
      <div>
        <Navbar />
        <div style={S.wrap}>
          {renderProgress()}
          <div style={S.card}>
            <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Scale {currentScaleIdx + 1} of {totalScales}
            </p>
            <h1 style={S.h1}>{currentScale?.scale_name || 'Scale'}</h1>
            <p style={S.sub}>Please answer all questions honestly and to the best of your ability.</p>

            {error && <div style={S.err}>{error}</div>}

            <div style={S.btnRow}>
              <button style={S.btnSkip} onClick={handleSkipScale}>Skip this scale</button>
              <button style={S.btnSecondary} onClick={() => { resetAssessment(); navigate(-1) }}>
                Go Back
              </button>
              <button style={S.btnPrimary} onClick={handleStartScale}>
                Begin Scale
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── RUNNING ───────────────────────────────────────────────
  if (phase === PHASE.RUNNING) {
    return (
      <div>
        <Navbar />
        <div style={S.wrap}>
          {renderProgress()}
          {isLoading && <LoadingSpinner message="Submitting..." />}
          {!isLoading && currentScale && (
            <div>
              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ ...S.h1, marginBottom: 0, fontSize: '18px' }}>
                  {currentScale.scale_name}
                </h1>
                <button style={S.btnSkip} onClick={handleSkipScale}>Skip this scale</button>
              </div>
              {error && <div style={S.err}>{error}</div>}
              <ScaleRunner onComplete={handleScaleComplete} />
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── SCORE ─────────────────────────────────────────────────
  if (phase === PHASE.SCORE) {
    const score = submittedScore
    const scaleName = currentScale?.scale_name || 'Scale'
    const color = severityColor(score?.severity_level)

    return (
      <div>
        <Navbar />
        <div style={S.wrap}>
          {renderProgress()}
          <div style={S.scoreBox}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '6px' }}>{scaleName}</h2>
            <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '20px' }}>Scale Complete</p>

            {score ? (
              <div style={{ textAlign: 'center' }}>
                <div style={S.scoreNum}>{score.calculated_value ?? '—'}</div>
                {score.max_possible > 0 && (
                  <div style={{ color: '#9ca3af', fontSize: '16px', marginTop: '4px' }}>
                    / {score.max_possible}
                  </div>
                )}
                {score.severity_label && (
                  <div style={S.severityBadge(color)}>{score.severity_label}</div>
                )}
                {score.risk_flags?.length > 0 && (
                  <div style={{ marginTop: '16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px', textAlign: 'left' }}>
                    <p style={{ color: '#dc2626', fontWeight: '600', marginBottom: '8px', fontSize: '13px' }}>Clinical Alerts</p>
                    {score.risk_flags.map((f, i) => (
                      <div key={i} style={{ fontSize: '13px', marginBottom: '4px' }}>
                        {f.priority === 'high' ? '🔴' : '🟡'} {f.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: '#6b7280', fontSize: '14px' }}>Score recorded successfully.</p>
            )}
          </div>

          <div style={{ ...S.btnRow, justifyContent: 'space-between' }}>
            <div style={{ fontSize: '13px', color: '#6b7280', alignSelf: 'center' }}>
              {remaining > 0 && `${remaining} scale${remaining !== 1 ? 's' : ''} remaining`}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {remaining > 0 && (
                <button style={S.btnSkip} onClick={() => { advanceToNextScale(); setPhase(PHASE.DONE) }}>
                  Skip Remaining
                </button>
              )}
              <button style={S.btnPrimary} onClick={handleNextAfterScore}>
                {remaining === 0 ? 'View Summary' : 'Next Scale →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── DONE ──────────────────────────────────────────────────
  if (phase === PHASE.DONE) {
    const skipped = totalScales - completedScores.length

    return (
      <div>
        <Navbar />
        <div style={S.wrap}>
          <div style={{ ...S.card, marginBottom: '20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
            <h1 style={S.h1}>Assessment Complete</h1>
            <p style={S.sub}>{activeSession?.disease_name}</p>
            <p style={{ fontSize: '13px', color: '#6b7280' }}>
              {completedScores.length} scale{completedScores.length !== 1 ? 's' : ''} completed
              {skipped > 0 ? `, ${skipped} skipped` : ''}
            </p>
          </div>

          {completedScores.length > 0 && (
            <div style={S.summaryCard}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>Score Summary</h2>
              {completedScores.map((item, i) => {
                const c = severityColor(item.score?.severity_level)
                return (
                  <div key={i} style={S.summaryRow}>
                    <span style={{ color: '#374151', fontWeight: '500' }}>{item.scale_name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: '700', fontSize: '16px', color: '#111827' }}>
                        {item.score?.calculated_value ?? '—'}
                        {item.score?.max_possible > 0 && (
                          <span style={{ fontWeight: '400', color: '#9ca3af', fontSize: '13px' }}>
                            /{item.score.max_possible}
                          </span>
                        )}
                      </span>
                      {item.score?.severity_label && (
                        <span style={{ background: c + '20', color: c, borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '600' }}>
                          {item.score.severity_label}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ ...S.btnRow, marginTop: '24px' }}>
            <button style={S.btnPrimary} onClick={handleDone}>
              Back to Assessments
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
