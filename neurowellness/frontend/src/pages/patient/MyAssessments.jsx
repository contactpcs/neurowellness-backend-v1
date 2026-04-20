import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { usePrsStore } from '../../store/prsStore'
import PatientLayout from '../../components/layout/PatientLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const S = {
  h1: { fontSize: '22px', fontWeight: '700', marginBottom: '20px', color: '#111827' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' },
  card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: '14px' },
  diseaseName: { fontSize: '18px', fontWeight: '700', color: '#111827' },
  scaleList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  scaleItem: (done) => ({
    display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '13px', color: done ? '#9ca3af' : '#374151',
    textDecoration: done ? 'line-through' : 'none',
  }),
  dot: (done) => ({
    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
    background: done ? '#86efac' : '#4f46e5',
  }),
  progress: { fontSize: '12px', color: '#6b7280' },
  progressBar: { background: '#e5e7eb', borderRadius: '4px', height: '6px', overflow: 'hidden' },
  progressFill: (pct) => ({ background: pct === 100 ? '#16a34a' : '#4f46e5', height: '6px', width: `${pct}%`, transition: 'width 0.3s' }),
  btn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', alignSelf: 'flex-start' },
  btnDone: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', alignSelf: 'flex-start', cursor: 'default' },
  empty: { textAlign: 'center', background: '#fff', borderRadius: '12px', padding: '60px 20px', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
}

export default function MyAssessments() {
  const [diseases, setDiseases] = useState([])
  const [loading, setLoading] = useState(true)
  const { resetAssessment } = usePrsStore()
  const navigate = useNavigate()

  useEffect(() => {
    resetAssessment()
    api.get('/patients/my-assessments')
      .then(r => setDiseases(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleTakeTest = (disease) => {
    navigate(`/assessment?disease_id=${disease.disease_id}`)
  }

  if (loading) return <PatientLayout><LoadingSpinner /></PatientLayout>

  return (
    <PatientLayout>
      <h1 style={S.h1}>My Assessments</h1>

      {!diseases.length ? (
        <div style={S.empty}>
          <p style={{ fontSize: '16px', marginBottom: '8px', fontWeight: '600' }}>No assessments yet</p>
          <p style={{ fontSize: '14px' }}>Your doctor will assign assessments when needed</p>
        </div>
      ) : (
        <div style={S.grid}>
          {diseases.map(disease => {
            const total   = disease.scales_total || disease.scales?.length || 0
            const done    = disease.scales_completed || 0
            const pct     = total ? Math.round((done / total) * 100) : 0
            const allDone = disease.status === 'completed' || (total > 0 && done >= total)

            return (
              <div key={disease.disease_id} style={S.card}>
                <div style={S.diseaseName}>{disease.disease_name}</div>

                {/* Scale list */}
                <ul style={S.scaleList}>
                  {(disease.scales || []).map(scale => (
                    <li key={scale.scale_id} style={S.scaleItem(scale.status === 'completed')}>
                      <div style={S.dot(scale.status === 'completed')} />
                      {scale.scale_name}
                      {scale.status === 'completed' && (
                        <span style={{ fontSize: '11px', color: '#16a34a', marginLeft: 'auto', fontWeight: '600' }}>
                          ✓ Done
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {/* Progress */}
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
                  <button style={S.btn} onClick={() => handleTakeTest(disease)}>
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
