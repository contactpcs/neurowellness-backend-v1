import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../lib/api'
import DoctorLayout from '../../components/layout/DoctorLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const S = {
  h1: { fontSize: '22px', fontWeight: '700', marginBottom: '20px', color: '#111827' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' },
  statCard: { background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  statNum: { fontSize: '32px', fontWeight: '800', color: '#4f46e5' },
  statLabel: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  card: { background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' },
  cardTitle: { fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#111827' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '8px 12px', background: '#f9fafb', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', color: '#374151' },
}

export default function DoctorDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/doctors/dashboard')
      .then(r => setData(r.data.data))
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <DoctorLayout><LoadingSpinner /></DoctorLayout>
  if (error) return <DoctorLayout><p style={{ color: 'red' }}>{error}</p></DoctorLayout>

  const { profile, patients_summary, recent_completed_assessments } = data

  return (
    <DoctorLayout>
      <h1 style={S.h1}>Welcome, {profile?.full_name}</h1>

      <div style={S.statsGrid}>
        <div style={S.statCard}>
          <div style={S.statNum}>{patients_summary?.total ?? 0}</div>
          <div style={S.statLabel}>Total Patients</div>
        </div>
        <div style={S.statCard}>
          <div style={{ ...S.statNum, color: '#f59e0b' }}>{patients_summary?.pending_assessments ?? 0}</div>
          <div style={S.statLabel}>Pending Assessments</div>
        </div>
        <div style={{ ...S.statCard, background: '#eef2ff' }}>
          <div style={{ fontSize: '14px', color: '#4f46e5', fontWeight: '600' }}>
            {profile?.specialization || 'General'}
          </div>
          <div style={S.statLabel}>Specialization</div>
        </div>
        <div style={{ ...S.statCard }}>
          <div style={{ ...S.statNum, fontSize: '18px', color: '#16a34a' }}>
            {profile?.availability || 'Available'}
          </div>
          <div style={S.statLabel}>Status</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
        <Link to="/doctor/patients" style={{
          background: '#4f46e5', color: '#fff', padding: '10px 20px',
          borderRadius: '8px', fontWeight: '600', fontSize: '14px', textDecoration: 'none',
        }}>View All Patients</Link>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>Recent Completed Assessments</div>
        {!recent_completed_assessments?.length ? (
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>No assessments yet</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Score</th>
                <th style={S.th}>Severity</th>
                <th style={S.th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {recent_completed_assessments.map((a, i) => (
                <tr key={i}>
                  <td style={S.td}>{a.total_score} / {a.max_possible}</td>
                  <td style={S.td}>{a.overall_severity_label || '—'}</td>
                  <td style={S.td}>{a.calculated_at ? new Date(a.calculated_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DoctorLayout>
  )
}
