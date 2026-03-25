import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import PatientLayout from '../../components/layout/PatientLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const STATUS_BADGE = {
  granted: { color: '#4f46e5', bg: '#eef2ff' },
  completed: { color: '#16a34a', bg: '#f0fdf4' },
  revoked: { color: '#dc2626', bg: '#fef2f2' },
}

export default function MyAssessments() {
  const [assessments, setAssessments] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/patients/my-assessments')
      .then(r => setAssessments(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <PatientLayout>
      <h1 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px', color: '#111827' }}>My Assessments</h1>

      {loading ? <LoadingSpinner /> : (
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          {!assessments.length ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              <p style={{ fontSize: '16px', marginBottom: '8px' }}>No assessments yet</p>
              <p style={{ fontSize: '14px' }}>Your doctor will assign assessments when needed</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr>
                  {['Scale', 'Description', 'Status', 'Assigned', 'Action'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', background: '#f9fafb', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assessments.map((a, i) => {
                  const badge = STATUS_BADGE[a.status] || STATUS_BADGE.revoked
                  return (
                    <tr key={i}>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontWeight: '600' }}>
                        {a.prs_scales?.name || a.scale_id}
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', color: '#6b7280', maxWidth: '200px' }}>
                        {(a.prs_scales?.description || '').slice(0, 60)}{a.prs_scales?.description?.length > 60 ? '...' : ''}
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                        <span style={{ background: badge.bg, color: badge.color, borderRadius: '12px', padding: '3px 10px', fontWeight: '600', fontSize: '12px' }}>
                          {a.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>
                        {a.granted_at ? new Date(a.granted_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                        {a.status === 'granted' && (
                          <button
                            onClick={() => navigate(`/assessment?scale_id=${a.scale_id}`)}
                            style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                          >
                            Take Assessment
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
      )}
    </PatientLayout>
  )
}
