import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import StaffLayout from '../../components/layout/StaffLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const S = {
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '20px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' },
  card: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  cardTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginBottom: '14px' },
  statNum: { fontSize: '32px', fontWeight: '800', color: '#4f46e5' },
  statLabel: { fontSize: '12px', color: '#6b7280' },
  sessionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' },
  badge: (color) => ({ display: 'inline-block', background: color + '20', color, borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '600' }),
  btn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
}

const statusColor = (s) => s === 'in_progress' ? '#059669' : s === 'scheduled' ? '#4f46e5' : '#6b7280'

export default function ReceptionistDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/staff/dashboard')
      .then(r => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <StaffLayout><LoadingSpinner /></StaffLayout>
  if (!data) return <StaffLayout><p>Failed to load dashboard</p></StaffLayout>

  const { patients_summary, upcoming_sessions = [] } = data

  return (
    <StaffLayout>
      <h1 style={S.h1}>Receptionist Dashboard</h1>

      <div style={S.grid}>
        <div style={S.card}>
          <div style={S.cardTitle}>Patients</div>
          <div style={S.statNum}>{patients_summary?.total || 0}</div>
          <div style={S.statLabel}>Total registered</div>
        </div>
        <div style={S.card}>
          <div style={S.cardTitle}>Pending Assessments</div>
          <div style={S.statNum}>{patients_summary?.pending_assessments || 0}</div>
          <div style={S.statLabel}>Awaiting completion</div>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ ...S.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Upcoming Sessions</span>
          <button style={S.btn} onClick={() => navigate('/receptionist/patients')}>View All Patients</button>
        </div>
        {!upcoming_sessions.length ? (
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>No upcoming sessions</p>
        ) : (
          upcoming_sessions.map((s, i) => (
            <div key={i} style={S.sessionRow}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>Session #{s.id?.slice(0, 8)}</div>
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                  {s.session_date ? new Date(s.session_date).toLocaleString() : '—'}
                </div>
              </div>
              <span style={S.badge(statusColor(s.status))}>{s.status}</span>
            </div>
          ))
        )}
      </div>
    </StaffLayout>
  )
}
