import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { usePrsStore } from '../../store/prsStore'
import PatientLayout from '../../components/layout/PatientLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const C = {
  orange:    '#F47920',
  orangeL:   '#FEF3E8',
  orangeBdr: '#F9C38A',
  green:     '#16a34a',
  greenL:    '#f0fdf4',
  greenBdr:  '#86efac',
  indigo:    '#4f46e5',
  navy:      '#0f172a',
  slate:     '#64748b',
  border:    '#e2e8f0',
  white:     '#ffffff',
}

const S = {
  h1: { fontSize: '22px', fontWeight: '700', marginBottom: '20px', color: C.navy },

  // anamnesis banner styles
  anaBannerPending: {
    background: C.orangeL, border: `2px solid ${C.orangeBdr}`, borderRadius: '12px',
    padding: '20px 24px', marginBottom: '28px', display: 'flex',
    alignItems: 'center', gap: '16px',
  },
  anaBannerDone: {
    background: C.greenL, border: `1.5px solid ${C.greenBdr}`, borderRadius: '12px',
    padding: '16px 24px', marginBottom: '28px', display: 'flex',
    alignItems: 'center', gap: '12px',
  },
  anaBannerIcon: { fontSize: '32px', flexShrink: 0 },
  anaBannerTitle: { fontSize: '16px', fontWeight: '700', color: C.navy, marginBottom: '4px' },
  anaBannerSub:   { fontSize: '13px', color: C.slate },
  anaBannerBtn:   {
    marginLeft: 'auto', flexShrink: 0, background: C.orange, color: C.white,
    border: 'none', borderRadius: '8px', padding: '10px 22px',
    fontSize: '13px', fontWeight: '700', cursor: 'pointer',
  },
  anaDoneTag: {
    marginLeft: 'auto', fontSize: '13px', fontWeight: '600', color: C.green,
    display: 'flex', alignItems: 'center', gap: '6px',
  },
  anaViewLink: {
    background: 'transparent', border: `1px solid ${C.greenBdr}`, borderRadius: '6px',
    padding: '6px 14px', fontSize: '12px', fontWeight: '600', color: C.green, cursor: 'pointer',
  },

  // PRS grid
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' },
  card: {
    background: C.white, borderRadius: '12px', padding: '24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: '14px',
  },
  cardLocked: {
    background: '#f9fafb', borderRadius: '12px', padding: '24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column',
    gap: '14px', opacity: 0.65, pointerEvents: 'none',
  },
  diseaseName: { fontSize: '18px', fontWeight: '700', color: C.navy },
  scaleList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  scaleItem: (done) => ({
    display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '13px', color: done ? '#9ca3af' : '#374151',
    textDecoration: done ? 'line-through' : 'none',
  }),
  dot: (done) => ({
    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
    background: done ? C.green : C.indigo,
  }),
  progress:     { fontSize: '12px', color: C.slate },
  progressBar:  { background: '#e5e7eb', borderRadius: '4px', height: '6px', overflow: 'hidden' },
  progressFill: (pct) => ({
    background: pct === 100 ? C.green : C.indigo,
    height: '6px', width: `${pct}%`, transition: 'width 0.3s',
  }),
  btn: {
    background: C.indigo, color: C.white, border: 'none', borderRadius: '8px',
    padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', alignSelf: 'flex-start',
  },
  btnDone: {
    background: C.greenL, color: C.green, border: `1px solid ${C.greenBdr}`,
    borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600',
    alignSelf: 'flex-start', cursor: 'default',
  },
  lockNote: { fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' },
  empty: {
    textAlign: 'center', background: C.white, borderRadius: '12px',
    padding: '60px 20px', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
}

export default function MyAssessments() {
  const [diseases,         setDiseases]         = useState([])
  const [anamnesisStatus,  setAnamnesisStatus]  = useState(null) // null | 'in_progress' | 'completed'
  const [loading,          setLoading]          = useState(true)
  const { resetAssessment } = usePrsStore()
  const navigate = useNavigate()

  useEffect(() => {
    resetAssessment()
    Promise.all([
      api.get('/patients/my-assessments').catch(() => ({ data: { data: [] } })),
      api.get('/anamnesis/me').catch(e => e.response?.status === 404 ? null : null),
    ]).then(([prsRes, anaRes]) => {
      setDiseases(prsRes.data.data || [])
      if (anaRes) setAnamnesisStatus(anaRes.data.data?.status || null)
    }).finally(() => setLoading(false))
  }, [])

  const anamnesisCompleted = anamnesisStatus === 'completed'

  if (loading) return <PatientLayout><LoadingSpinner /></PatientLayout>

  return (
    <PatientLayout>
      <h1 style={S.h1}>My Assessments</h1>

      {/* ── Anamnesis banner ─────────────────────────────────────────────── */}
      {!anamnesisCompleted ? (
        <div style={S.anaBannerPending}>
          <span style={S.anaBannerIcon}>🩺</span>
          <div>
            <div style={S.anaBannerTitle}>Complete Anamnesis Assessment First</div>
            <div style={S.anaBannerSub}>
              Your medical history form must be filled in before you can start any PRS assessment.
              It only needs to be done once.
            </div>
          </div>
          <button style={S.anaBannerBtn} onClick={() => navigate('/patient/anamnesis')}>
            {anamnesisStatus === 'in_progress' ? 'Continue Anamnesis →' : 'Start Anamnesis →'}
          </button>
        </div>
      ) : (
        <div style={S.anaBannerDone}>
          <span>✅</span>
          <span style={{ fontSize: '14px', fontWeight: '600', color: C.green }}>
            Anamnesis Completed
          </span>
          <span style={{ fontSize: '13px', color: C.slate }}>
            — Your medical history is on record. PRS assessments are unlocked.
          </span>
          <div style={S.anaDoneTag}>
            <button style={S.anaViewLink} onClick={() => navigate('/patient/anamnesis')}>
              View →
            </button>
          </div>
        </div>
      )}

      {/* ── PRS Assessment cards ─────────────────────────────────────────── */}
      {!diseases.length ? (
        <div style={S.empty}>
          <p style={{ fontSize: '16px', marginBottom: '8px', fontWeight: '600' }}>No assessments assigned yet</p>
          <p style={{ fontSize: '14px' }}>Your doctor will assign assessments when needed</p>
        </div>
      ) : (
        <div style={S.grid}>
          {diseases.map(disease => {
            const total   = disease.scales_total || disease.scales?.length || 0
            const done    = disease.scales_completed || 0
            const pct     = total ? Math.round((done / total) * 100) : 0
            const allDone = disease.status === 'completed' || (total > 0 && done >= total)
            const locked  = !anamnesisCompleted

            return (
              <div key={disease.disease_id} style={locked ? S.cardLocked : S.card}>
                <div style={S.diseaseName}>{disease.disease_name}</div>

                {locked && (
                  <div style={S.lockNote}>🔒 Complete your anamnesis to unlock</div>
                )}

                <ul style={S.scaleList}>
                  {(disease.scales || []).map(scale => (
                    <li key={scale.scale_id} style={S.scaleItem(scale.status === 'completed')}>
                      <div style={S.dot(scale.status === 'completed')} />
                      {scale.scale_name}
                      {scale.status === 'completed' && (
                        <span style={{ fontSize: '11px', color: C.green, marginLeft: 'auto', fontWeight: '600' }}>
                          ✓ Done
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={S.progress}>{done} of {total} scales completed</span>
                    <span style={S.progress}>{pct}%</span>
                  </div>
                  <div style={S.progressBar}>
                    <div style={S.progressFill(pct)} />
                  </div>
                </div>

                {allDone ? (
                  <div style={S.btnDone}>✓ All Completed</div>
                ) : (
                  <button
                    style={S.btn}
                    disabled={locked}
                    onClick={() => navigate(`/assessment?disease_id=${disease.disease_id}`)}
                  >
                    {done > 0 ? 'Continue Assessment' : 'Take Test'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </PatientLayout>
  )
}
