import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import StaffLayout from '../../components/layout/StaffLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const S = {
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '20px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' },
  card: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' },
  cardTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginBottom: '14px' },
  statNum: { fontSize: '32px', fontWeight: '800', color: '#4f46e5' },
  statLabel: { fontSize: '12px', color: '#6b7280' },
  pendingCard: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '20px' },
  pendingTitle: { fontSize: '15px', fontWeight: '700', color: '#92400e', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  pendingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #fde68a' },
  sessionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' },
  badge: (color) => ({ display: 'inline-block', background: color + '20', color, borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '600' }),
  btn: { background: '#0891b2', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  approveBtn: { background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginRight: '6px' },
  rejectBtn: { background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' },
  viewAllLink: { fontSize: '13px', color: '#0891b2', fontWeight: '600', cursor: 'pointer', background: 'none', border: 'none' },
}

const statusColor = (s) => s === 'in_progress' ? '#059669' : s === 'scheduled' ? '#4f46e5' : '#6b7280'

export default function ReceptionistDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/staff/dashboard')
      .then(r => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
    api.get('/staff/patients/pending?limit=5')
      .then(r => setPending(r.data.data || []))
      .catch(() => {})
  }, [])

  const handleApprove = async (p) => {
    try {
      await api.put(`/staff/patients/${p.id}/approve`)
      setPending(prev => prev.filter(x => x.id !== p.id))
    } catch (e) { alert(e.response?.data?.detail || 'Approve failed') }
  }

  const handleReject = async (p) => {
    if (!confirm(`Reject and permanently delete ${p.full_name}'s registration?`)) return
    try {
      await api.put(`/staff/patients/${p.id}/reject`)
      setPending(prev => prev.filter(x => x.id !== p.id))
    } catch (e) { alert(e.response?.data?.detail || 'Reject failed') }
  }

  if (loading) return <StaffLayout><LoadingSpinner /></StaffLayout>
  if (!data) return <StaffLayout><p>Failed to load dashboard</p></StaffLayout>

  const { patients_summary, upcoming_sessions = [] } = data

  return (
    <StaffLayout>
      <h1 style={S.h1}>Receptionist Dashboard</h1>

      {pending.length > 0 && (
        <div style={S.pendingCard}>
          <div style={S.pendingTitle}>
            <span>Pending Approvals ({pending.length})</span>
            <button style={S.viewAllLink} onClick={() => navigate('/receptionist/patients')}>View all →</button>
          </div>
          {pending.map(p => (
            <div key={p.id} style={S.pendingRow}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>{p.full_name || '—'}</div>
                <div style={{ fontSize: '12px', color: '#92400e' }}>{p.email || '—'}</div>
              </div>
              <div>
                <button style={S.approveBtn} onClick={() => handleApprove(p)}>Approve</button>
                <button style={S.rejectBtn} onClick={() => handleReject(p)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

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
