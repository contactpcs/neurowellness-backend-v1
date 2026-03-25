import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import DoctorLayout from '../../components/layout/DoctorLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const SEVERITY_COLORS = { minimal: '#16a34a', mild: '#ca8a04', moderate: '#ea580c', severe: '#dc2626' }
const sevColor = (l) => SEVERITY_COLORS[l?.toLowerCase()] || '#6b7280'

const S = {
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '4px' },
  sub: { color: '#6b7280', fontSize: '14px', marginBottom: '24px' },
  tabs: { display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '2px solid #e5e7eb', paddingBottom: '0' },
  tab: (active) => ({
    padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: active ? '700' : '500',
    color: active ? '#4f46e5' : '#6b7280', borderBottom: active ? '2px solid #4f46e5' : 'none',
    background: 'none', border: 'none', marginBottom: '-2px',
  }),
  card: { background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '16px' },
  row: { display: 'flex', gap: '12px', marginBottom: '12px', fontSize: '14px' },
  label: { fontWeight: '600', color: '#374151', width: '140px', flexShrink: 0 },
  value: { color: '#6b7280' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '10px 12px', background: '#f9fafb', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', color: '#374151' },
  select: { border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', outline: 'none', flex: 1 },
  grantBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  takeBtn: { background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  badge: (color) => ({ display: 'inline-block', background: color + '20', color, borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '600' }),
}

export default function PatientDetail() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [scales, setScales] = useState([])
  const [selectedScale, setSelectedScale] = useState('')
  const [loading, setLoading] = useState(true)
  const [granting, setGranting] = useState(false)
  const [grantMsg, setGrantMsg] = useState('')
  const [scoresData, setScoresData] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get(`/doctors/patients/${patientId}`),
      api.get('/prs/scales?limit=100'),
    ]).then(([r1, r2]) => {
      setData(r1.data.data)
      setScales(r2.data.data || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [patientId])

  useEffect(() => {
    if (tab === 'scores' && !scoresData) {
      api.get(`/prs/scores/patient/${patientId}?limit=50`)
        .then(r => setScoresData(r.data.data || []))
        .catch(() => setScoresData([]))
    }
  }, [tab, patientId, scoresData])

  const handleGrant = async () => {
    if (!selectedScale) return
    setGranting(true)
    setGrantMsg('')
    try {
      await api.post(`/doctors/patients/${patientId}/grant-assessment`, { scale_id: selectedScale })
      setGrantMsg('Assessment granted successfully!')
      const r = await api.get(`/doctors/patients/${patientId}`)
      setData(r.data.data)
    } catch (e) {
      setGrantMsg(e.response?.data?.detail || 'Failed to grant')
    } finally {
      setGranting(false)
    }
  }

  const handleTakeOnBehalf = async (perm) => {
    try {
      navigate(`/assessment?scale_id=${perm.scale_id}&patient_id=${patientId}&taken_by=doctor_on_behalf`)
    } catch { }
  }

  if (loading) return <DoctorLayout><LoadingSpinner /></DoctorLayout>
  if (!data) return <DoctorLayout><p>Patient not found</p></DoctorLayout>

  const { patient, permissions, scores_summary } = data
  const prof = { ...patient }

  return (
    <DoctorLayout>
      <h1 style={S.h1}>{prof.full_name}</h1>
      <p style={S.sub}>{prof.email} · {[prof.city, prof.state].filter(Boolean).join(', ') || 'Location not set'}</p>

      <div style={S.tabs}>
        {['overview', 'assessments', 'scores'].map(t => (
          <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={S.card}>
          <h2 style={{ fontWeight: '600', marginBottom: '16px', fontSize: '16px' }}>Patient Information</h2>
          {[
            ['Full Name', prof.full_name],
            ['Email', prof.email],
            ['Phone', prof.phone || '—'],
            ['City', prof.city || '—'],
            ['State', prof.state || '—'],
            ['Gender', prof.gender || '—'],
            ['Medical History', prof.medical_history || '—'],
            ['Emergency Contact', prof.emergency_contact || '—'],
          ].map(([label, value]) => (
            <div key={label} style={S.row}>
              <span style={S.label}>{label}</span>
              <span style={S.value}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'assessments' && (
        <>
          <div style={S.card}>
            <h2 style={{ fontWeight: '600', marginBottom: '16px', fontSize: '15px' }}>Grant Assessment</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select style={S.select} value={selectedScale} onChange={e => setSelectedScale(e.target.value)}>
                <option value="">Select a scale...</option>
                {scales.map(s => <option key={s.id} value={s.id}>{s.name} ({s.scale_id})</option>)}
              </select>
              <button style={S.grantBtn} onClick={handleGrant} disabled={granting || !selectedScale}>
                {granting ? 'Granting...' : 'Grant Assessment'}
              </button>
            </div>
            {grantMsg && <p style={{ marginTop: '10px', fontSize: '13px', color: grantMsg.includes('success') ? '#16a34a' : '#dc2626' }}>{grantMsg}</p>}
          </div>

          <div style={S.card}>
            <h2 style={{ fontWeight: '600', marginBottom: '16px', fontSize: '15px' }}>Granted Assessments</h2>
            {!permissions?.length ? (
              <p style={{ color: '#9ca3af', fontSize: '14px' }}>No assessments granted yet</p>
            ) : (
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Scale</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Granted</th>
                  <th style={S.th}>Actions</th>
                </tr></thead>
                <tbody>
                  {permissions.map((p, i) => (
                    <tr key={i}>
                      <td style={S.td}>{p.prs_scales?.name || p.scale_id || '—'}</td>
                      <td style={S.td}>
                        <span style={S.badge(p.status === 'granted' ? '#4f46e5' : p.status === 'completed' ? '#16a34a' : '#6b7280')}>
                          {p.status}
                        </span>
                      </td>
                      <td style={S.td}>{p.granted_at ? new Date(p.granted_at).toLocaleDateString() : '—'}</td>
                      <td style={S.td}>
                        {p.status === 'granted' && (
                          <button style={S.takeBtn} onClick={() => handleTakeOnBehalf(p)}>
                            Take on Behalf
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'scores' && (
        <div style={S.card}>
          <h2 style={{ fontWeight: '600', marginBottom: '16px', fontSize: '15px' }}>Assessment Scores</h2>
          {!scoresData ? <LoadingSpinner /> : !scoresData.length ? (
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>No scores yet</p>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Score</th>
                <th style={S.th}>Severity</th>
                <th style={S.th}>Date</th>
              </tr></thead>
              <tbody>
                {scoresData.map((s, i) => (
                  <tr key={i}>
                    <td style={S.td}>{s.total_score} / {s.max_possible}</td>
                    <td style={S.td}>
                      {s.overall_severity_label && <span style={S.badge(sevColor(s.overall_severity))}>{s.overall_severity_label}</span>}
                    </td>
                    <td style={S.td}>{s.calculated_at ? new Date(s.calculated_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </DoctorLayout>
  )
}
