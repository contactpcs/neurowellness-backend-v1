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
    width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700',
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

// ── Phase constants ────────────────────────────────────────────────────────────
const PHASE = { INTRO: 'intro', SCALE_INTRO: 'scale_intro', RUNNING: 'running', SCORE: 'score', DONE: 'done' }

export default function AssessmentPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { role } = useAuthStore()
  const {
    diseaseId, diseaseName, diseaseQueue, queueIndex, completedScores,
    activeSession, submittedScore, isLoading,
    startAssessment, resetAssessment, recordScoreAndAdvance, advanceQueue,
  } = usePrsStore()

  const [phase, setPhase] = useState(PHASE.INTRO)
  const [error, setError] = useState('')

  // Support legacy single-scale mode: ?scale_id=...&patient_id=...
  const scaleId = searchParams.get('scale_id')
  const patientId = searchParams.get('patient_id')
  const takenBy = (role === 'doctor' || role === 'clinical_assistant') && patientId
    ? 'doctor_on_behalf'
    : 'patient'
  const isSingleMode = !!scaleId && !diseaseId

  // ── Redirect if no context ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isSingleMode && !diseaseId) {
      navigate(-1)
    }
    if (isSingleMode) {
      resetAssessment()
      setPhase(PHASE.SCALE_INTRO)
    }
  }, [])

  // Whenever queue advances, go to next scale intro (or done)
  useEffect(() => {
    if (!diseaseId) return
    if (queueIndex >= diseaseQueue.length) {
      setPhase(PHASE.DONE)
    } else if (phase !== PHASE.INTRO) {
      setPhase(PHASE.SCALE_INTRO)
    }
  }, [queueIndex])

  const currentScale = diseaseQueue[queueIndex] || null
  const totalScales = diseaseQueue.length
  const progressPct = totalScales ? Math.round((queueIndex / totalScales) * 100) : 0

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleBeginDisease = () => setPhase(PHASE.SCALE_INTRO)

  const handleStartScale = async () => {
    setError('')
    const sid = isSingleMode ? scaleId : currentScale.scale_id
    try {
      await startAssessment(sid, takenBy, patientId || null)
      setPhase(PHASE.RUNNING)
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Failed to start assessment')
    }
  }

  const handleSkipScale = () => {
    setError('')
    if (isSingleMode) { navigate(-1); return }
    advanceQueue()
    // useEffect will set phase to SCALE_INTRO or DONE
  }

  const handleScaleComplete = (score) => {
    if (isSingleMode) {
      setPhase(PHASE.SCORE)
      return
    }
    const scaleName = currentScale?.scale_name || activeSession?.scale?.scale_name || 'Scale'
    recordScoreAndAdvance(scaleName, score)
    setPhase(PHASE.SCORE)
  }

  const handleNextAfterScore = () => {
    if (isSingleMode) {
      resetAssessment()
      navigate(role === 'doctor' || role === 'clinical_assistant' ? -1 : '/patient/assessments')
      return
    }
    // queueIndex already advanced by recordScoreAndAdvance
    if (queueIndex >= diseaseQueue.length) {
      setPhase(PHASE.DONE)
    } else {
      setPhase(PHASE.SCALE_INTRO)
    }
  }

  const handleDone = () => {
    resetAssessment()
    navigate(role === 'doctor' || role === 'clinical_assistant' ? -1 : '/patient/assessments')
  }

  // ── Render helpers ──────────────────────────────────────────────────────────
  if (!diseaseId && !scaleId) return null

  const renderProgress = () => isSingleMode ? null : (
    <div style={S.progress}>
      <div style={S.progressLabel}>
        <span>Scale {queueIndex + 1} of {totalScales}</span>
        <span>{progressPct}%</span>
      </div>
      <div style={S.progressBar}><div style={S.progressFill(progressPct)} /></div>
    </div>
  )

  // ── PHASE: INTRO ──────────────────────────────────────────────────────────
  if (phase === PHASE.INTRO) {
    return (
      <div>
        <Navbar />
        <div style={S.wrap}>
          <div style={S.card}>
            <h1 style={S.h1}>{diseaseName}</h1>
            <p style={{ ...S.sub, marginBottom: '4px' }}>This assessment includes {totalScales} scale{totalScales !== 1 ? 's' : ''}.</p>
            <p style={{ ...S.sub, fontSize: '13px', marginBottom: '0' }}>You can skip any scale if needed. Complete as many as you can.</p>

            <ul style={S.scaleList}>
              {diseaseQueue.map((sc, i) => (
                <li key={sc.scale_id} style={S.scaleItem(false, false)}>
                  <div style={S.dot(false, false)}>{i + 1}</div>
                  {sc.scale_name}
                </li>
              ))}
            </ul>

            <div style={S.btnRow}>
              <button style={S.btnSecondary} onClick={() => { resetAssessment(); navigate(-1) }}>Go Back</button>
              <button style={S.btnPrimary} onClick={handleBeginDisease}>Begin Assessment</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── PHASE: SCALE INTRO ────────────────────────────────────────────────────
  if (phase === PHASE.SCALE_INTRO) {
    const name = isSingleMode ? 'Assessment' : currentScale?.scale_name
    return (
      <div>
        <Navbar />
        <div style={S.wrap}>
          {renderProgress()}
          <div style={S.card}>
            {!isSingleMode && (
              <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Scale {queueIndex + 1} of {totalScales}
              </p>
            )}
            <h1 style={S.h1}>{name}</h1>
            <p style={S.sub}>Please answer all questions honestly and to the best of your ability.</p>

            {error && <div style={S.err}>{error}</div>}

            <div style={S.btnRow}>
              {!isSingleMode && (
                <button style={S.btnSkip} onClick={handleSkipScale}>Skip this scale</button>
              )}
              <button style={S.btnSecondary} onClick={() => { resetAssessment(); navigate(-1) }}>Go Back</button>
              <button style={S.btnPrimary} onClick={handleStartScale} disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Begin Scale'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── PHASE: RUNNING ────────────────────────────────────────────────────────
  if (phase === PHASE.RUNNING) {
    return (
      <div>
        <Navbar />
        <div style={S.wrap}>
          {renderProgress()}
          {isLoading && <LoadingSpinner message="Loading questions..." />}
          {!isLoading && activeSession && (
            <div>
              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ ...S.h1, marginBottom: 0, fontSize: '18px' }}>
                  {activeSession.scale?.scale_name}
                </h1>
                {!isSingleMode && (
                  <button style={S.btnSkip} onClick={handleSkipScale}>Skip this scale</button>
                )}
              </div>
              <ScaleRunner onComplete={handleScaleComplete} />
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── PHASE: SCORE ──────────────────────────────────────────────────────────
  if (phase === PHASE.SCORE) {
    // submittedScore is in the store right after submit; for disease mode we also have completedScores
    const score = submittedScore || (completedScores.length ? completedScores[completedScores.length - 1]?.score : null)
    const scaleName = activeSession?.scale?.scale_name || (completedScores.length ? completedScores[completedScores.length - 1]?.scale_name : '') || 'Scale'
    const color = severityColor(score?.severity_level)
    const remaining = totalScales - queueIndex  // queueIndex already advanced

    return (
      <div>
        <Navbar />
        <div style={S.wrap}>
          {renderProgress()}
          <div style={S.scoreBox}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '6px' }}>{scaleName}</h2>
            <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '20px' }}>Assessment Complete</p>

            {score ? (
              <div style={{ textAlign: 'center' }}>
                <div style={S.scoreNum}>{score.calculated_value ?? score.total_score ?? '—'}</div>
                {score.max_possible > 0 && (
                  <div style={{ color: '#9ca3af', fontSize: '16px', marginTop: '4px' }}>
                    / {score.max_possible}
                    {score.percentage != null && ` (${score.percentage}%)`}
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
              {!isSingleMode && remaining > 0 && `${remaining} scale${remaining !== 1 ? 's' : ''} remaining`}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {!isSingleMode && remaining > 0 && (
                <button style={S.btnSkip} onClick={() => { advanceQueue(); setPhase(PHASE.DONE) }}>
                  Skip Remaining
                </button>
              )}
              <button style={S.btnPrimary} onClick={handleNextAfterScore}>
                {isSingleMode || remaining === 0 ? 'Back to Assessments' : 'Next Scale →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── PHASE: DONE ───────────────────────────────────────────────────────────
  if (phase === PHASE.DONE) {
    const skipped = totalScales - completedScores.length

    return (
      <div>
        <Navbar />
        <div style={S.wrap}>
          <div style={{ ...S.card, marginBottom: '20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
            <h1 style={S.h1}>Assessment Complete</h1>
            <p style={S.sub}>{diseaseName}</p>
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
            <button style={S.btnPrimary} onClick={handleDone}>Back to Assessments</button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
