import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import DoctorLayout from '../../components/layout/DoctorLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const SEVERITY_COLORS = {
  normal: '#16a34a', minimal: '#16a34a', mild: '#ca8a04', moderate: '#ea580c',
  severe: '#dc2626', very_severe: '#7f1d1d',
}
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
  const [conditions, setConditions] = useState([])   // disease list for grant picker
  const [selectedDisease, setSelectedDisease] = useState('')
  const [loading, setLoading] = useState(true)
  const [granting, setGranting] = useState(false)
  const [grantMsg, setGrantMsg] = useState('')
  const [scoresData, setScoresData] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get(`/doctors/patients/${patientId}`),
      api.get('/prs/conditions'),
    ]).then(([r1, r2]) => {
      setData(r1.data.data)
      setConditions(r2.data.data || [])
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
    if (!selectedDisease) return
    setGranting(true)
    setGrantMsg('')
    try {
      const res = await api.post(`/doctors/patients/${patientId}/grant-assessment`, {
        disease_id: selectedDisease,
      })
      const { disease_name, scales_count } = res.data.data
      setGrantMsg(`Assessment granted for ${disease_name} (${scales_count} scales)`)
      const r = await api.get(`/doctors/patients/${patientId}`)
      setData(r.data.data)
      setSelectedDisease('')
    } catch (e) {
      setGrantMsg(e.response?.data?.detail || 'Failed to grant')
    } finally {
      setGranting(false)
    }
  }

  const handleTakeOnBehalf = (perm) => {
    navigate(`/assessment?disease_id=${perm.disease_id}&patient_id=${patientId}&taken_by=doctor_on_behalf`)
  }

  if (loading) return <DoctorLayout><LoadingSpinner /></DoctorLayout>
  if (!data) return <DoctorLayout><p>Patient not found</p></DoctorLayout>

  const { patient, permissions, scores_summary } = data
  const prof = { ...patient }

  // Group all scale-level permission rows by disease for display
  const permsByDisease = (permissions || []).reduce((acc, p) => {
    const key = p.disease_id || 'Unknown'
    if (!acc[key]) acc[key] = { disease_id: key, name: p.prs_diseases?.disease_name || key, perms: [] }
    acc[key].perms.push(p)
    return acc
  }, {})

  return (
    <DoctorLayout>
      <h1 style={S.h1}>{prof.full_name}</h1>
      <p style={S.sub}>{prof.email}</p>

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
            ['Gender', prof.gender || '—'],
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
          {/* ── Grant section ── */}
          <div style={S.card}>
            <h2 style={{ fontWeight: '600', marginBottom: '4px', fontSize: '15px' }}>Assign Disease Assessment</h2>
            <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '14px' }}>
              Selecting a disease will automatically grant all its scales and create a session for this patient.
            </p>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                style={S.select}
                value={selectedDisease}
                onChange={e => setSelectedDisease(e.target.value)}
              >
                <option value="">Select a disease...</option>
                {conditions.map(c => (
                  <option key={c.disease_id} value={c.disease_id}>
                    {c.disease_name}
                  </option>
                ))}
              </select>
              <button
                style={{ ...S.grantBtn, opacity: granting || !selectedDisease ? 0.6 : 1 }}
                onClick={handleGrant}
                disabled={granting || !selectedDisease}
              >
                {granting ? 'Granting...' : 'Grant All Scales'}
              </button>
            </div>
            {grantMsg && (
              <p style={{ marginTop: '10px', fontSize: '13px', color: grantMsg.toLowerCase().includes('granted') ? '#16a34a' : '#dc2626' }}>
                {grantMsg}
              </p>
            )}
          </div>

          {/* ── Granted permissions grouped by disease ── */}
          <div style={S.card}>
            <h2 style={{ fontWeight: '600', marginBottom: '16px', fontSize: '15px' }}>Granted Assessments</h2>
            {!Object.keys(permsByDisease).length ? (
              <p style={{ color: '#9ca3af', fontSize: '14px' }}>No assessments granted yet</p>
            ) : (
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Disease</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Granted</th>
                  <th style={S.th}>Actions</th>
                </tr></thead>
                <tbody>
                  {Object.entries(permsByDisease).map(([diseaseId, group]) => {
                    const perm = group.perms[0]
                    return (
                      <tr key={diseaseId}>
                        <td style={{ ...S.td, fontWeight: '600' }}>{group.name}</td>
                        <td style={S.td}>
                          <span style={S.badge(
                            perm.status === 'granted' ? '#4f46e5'
                            : perm.status === 'completed' ? '#16a34a'
                            : '#6b7280'
                          )}>
                            {perm.status}
                          </span>
                        </td>
                        <td style={S.td}>{perm.granted_at ? new Date(perm.granted_at).toLocaleDateString() : '—'}</td>
                        <td style={S.td}>
                          {perm.status === 'granted' && (
                            <button style={S.takeBtn} onClick={() => handleTakeOnBehalf(perm)}>
                              Take on Behalf
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
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
                <th style={S.th}>Disease</th>
                <th style={S.th}>Disease Score</th>
                <th style={S.th}>Severity</th>
                <th style={S.th}>Scales</th>
                <th style={S.th}>Date</th>
                <th style={S.th}></th>
              </tr></thead>
              <tbody>
                {scoresData.map((s, i) => {
                  const color = sevColor(s.severity_level || s.overall_severity)
                  return (
                    <tr key={i}>
                      <td style={{ ...S.td, fontWeight: '600' }}>{s.disease_name || s.disease_id || '—'}</td>
                      <td style={S.td}>
                        {s.disease_score != null ? (
                          <span style={{ fontWeight: '700', fontSize: '16px', color }}>{Math.round(s.disease_score)}<span style={{ color: '#9ca3af', fontWeight: '400', fontSize: '12px' }}>/100</span></span>
                        ) : s.calculated_value != null ? (
                          <span style={{ fontWeight: '700', fontSize: '16px', color: '#111827' }}>{s.calculated_value}<span style={{ color: '#9ca3af', fontWeight: '400', fontSize: '12px' }}>/{s.max_possible}</span></span>
                        ) : '—'}
                      </td>
                      <td style={S.td}>
                        {(s.severity_label || s.overall_severity_label) && (
                          <span style={S.badge(color)}>{s.severity_label || s.overall_severity_label}</span>
                        )}
                      </td>
                      <td style={{ ...S.td, color: '#6b7280' }}>
                        {s.scale_summaries?.length > 0 ? `${s.scale_summaries.length} scales` : '—'}
                      </td>
                      <td style={S.td}>{s.completed_at ? new Date(s.completed_at).toLocaleDateString() : '—'}</td>
                      <td style={S.td}>
                        <button
                          onClick={() => navigate(`/doctor/patients/${patientId}/scores/${s.instance_id}`)}
                          style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </DoctorLayout>
  )
}
