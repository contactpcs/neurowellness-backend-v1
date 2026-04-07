import { useEffect, useState } from 'react'
import api from '../../lib/api'
import PatientLayout from '../../components/layout/PatientLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const SEVERITY_COLORS = { minimal: '#16a34a', mild: '#ca8a04', moderate: '#ea580c', severe: '#dc2626' }
const sevColor = (l) => SEVERITY_COLORS[l?.toLowerCase()] || '#6b7280'

export default function MyScores() {
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/patients/my-scores')
      .then(r => setScores(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <PatientLayout>
      <h1 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px', color: '#111827' }}>My Scores</h1>

      {loading ? <LoadingSpinner /> : (
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          {!scores.length ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              <p>No scores yet. Complete an assessment to see your results here.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr>
                  {['Assessment', 'Score', 'Max', 'Severity', 'Date'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', background: '#f9fafb', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scores.map((s, i) => {
                  const color = sevColor(s.overall_severity)
                  return (
                    <tr key={i}>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontWeight: '600', fontSize: '12px', color: '#6b7280' }}>
                        {s.instance_id || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontWeight: '700', fontSize: '16px', color: '#111827' }}>
                        {s.calculated_value}
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>
                        {s.max_possible}
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                        {s.overall_severity_label ? (
                          <span style={{ background: color + '20', color, borderRadius: '12px', padding: '3px 10px', fontWeight: '600', fontSize: '12px' }}>
                            {s.overall_severity_label}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>
                        {s.time_stamp ? new Date(s.time_stamp).toLocaleDateString() : '—'}
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
