import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import PatientLayout from '../../components/layout/PatientLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const SEV_COLORS = {
  normal: '#16a34a', mild: '#ca8a04', moderate: '#ea580c',
  severe: '#dc2626', very_severe: '#7f1d1d', default: '#6b7280',
}
const sevColor = (l) => SEV_COLORS[l?.toLowerCase()] || SEV_COLORS.default

const S = {
  h1: { fontSize: '22px', fontWeight: '700', marginBottom: '20px', color: '#111827' },
  card: { background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' },
  empty: { padding: '48px', textAlign: 'center', color: '#9ca3af' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '12px 16px', background: '#f9fafb', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '12px 16px', borderBottom: '1px solid #f3f4f6', color: '#374151', verticalAlign: 'middle' },
  badge: (color) => ({ display: 'inline-block', background: color + '20', color, borderRadius: '12px', padding: '3px 10px', fontWeight: '600', fontSize: '12px' }),
  viewBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  scoreCircle: (color) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '40px', height: '40px', borderRadius: '50%',
    background: color + '15', border: `2px solid ${color}`,
    fontWeight: '800', fontSize: '15px', color,
  }),
}

export default function MyScores() {
  const [instances, setInstances] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/prs/scores/me?limit=50')
      .then(r => setInstances(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <PatientLayout>
      <h1 style={S.h1}>My Scores</h1>

      {loading ? <LoadingSpinner /> : (
        <div style={S.card}>
          {!instances.length ? (
            <div style={S.empty}>
              <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '6px' }}>No scores yet</p>
              <p style={{ fontSize: '14px' }}>Complete an assessment to see your results here.</p>
            </div>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  {['Disease', 'Disease Score', 'Severity', 'Scales', 'Date', ''].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {instances.map((inst) => {
                  const color = sevColor(inst.severity_level || inst.overall_severity)
                  return (
                    <tr key={inst.instance_id}>
                      <td style={{ ...S.td, fontWeight: '600', color: '#111827' }}>
                        {inst.disease_name || inst.disease_id || '—'}
                      </td>
                      <td style={S.td}>
                        {inst.disease_score != null ? (
                          <div style={S.scoreCircle(color)}>{Math.round(inst.disease_score)}</div>
                        ) : inst.calculated_value != null ? (
                          <span style={{ fontWeight: '700', color: '#111827' }}>
                            {inst.calculated_value}<span style={{ color: '#9ca3af', fontWeight: '400' }}>/{inst.max_possible}</span>
                          </span>
                        ) : '—'}
                      </td>
                      <td style={S.td}>
                        {(inst.severity_label || inst.overall_severity_label) ? (
                          <span style={S.badge(color)}>{inst.severity_label || inst.overall_severity_label}</span>
                        ) : '—'}
                      </td>
                      <td style={{ ...S.td, color: '#6b7280' }}>
                        {inst.scale_summaries?.length > 0 ? `${inst.scale_summaries.length} scales` : '—'}
                      </td>
                      <td style={{ ...S.td, color: '#6b7280' }}>
                        {inst.completed_at
                          ? new Date(inst.completed_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td style={S.td}>
                        <button
                          style={S.viewBtn}
                          onClick={() => navigate(`/patient/scores/${inst.instance_id}`)}
                        >
                          View Detail
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
    </PatientLayout>
  )
}
