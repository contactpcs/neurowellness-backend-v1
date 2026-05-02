import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import AdminLayout from '../../components/layout/AdminLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const S = {
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '4px' },
  sub: { color: '#6b7280', fontSize: '14px', marginBottom: '24px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' },
  statCard: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' },
  statNum: { fontSize: '36px', fontWeight: '800', color: '#4f46e5' },
  statLabel: { fontSize: '12px', color: '#6b7280', marginTop: '4px' },
  card: { background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' },
  cardTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '10px 12px', background: '#f9fafb', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', color: '#374151' },
  badge: (active) => ({ display: 'inline-block', background: active ? '#dcfce720' : '#fee2e220', color: active ? '#16a34a' : '#dc2626', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '600', border: `1px solid ${active ? '#bbf7d0' : '#fca5a5'}` }),
  actions: { display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' },
  btn: (color) => ({ background: color, color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }),
}

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(r => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <AdminLayout><LoadingSpinner /></AdminLayout>
  if (!data) return <AdminLayout><p style={{ color: '#dc2626' }}>Failed to load dashboard</p></AdminLayout>

  const { stats, clinic_breakdown = [] } = data

  return (
    <AdminLayout>
      <h1 style={S.h1}>Admin Dashboard</h1>
      <p style={S.sub}>Global overview across all clinics</p>

      <div style={S.grid}>
        {[
          { label: 'Clinics', value: stats.total_clinics, color: '#4f46e5' },
          { label: 'Doctors', value: stats.total_doctors, color: '#059669' },
          { label: 'Receptionists', value: stats.total_receptionists, color: '#0891b2' },
          { label: 'Clinical Assistants', value: stats.total_clinical_assistants, color: '#7c3aed' },
          { label: 'Patients', value: stats.total_patients, color: '#ea580c' },
          { label: 'Pending Approvals', value: stats.pending_approvals, color: '#dc2626' },
          { label: 'Active Assessments', value: stats.active_assessments, color: '#ca8a04' },
        ].map(({ label, value, color }) => (
          <div key={label} style={S.statCard}>
            <div style={{ ...S.statNum, color }}>{value ?? 0}</div>
            <div style={S.statLabel}>{label}</div>
          </div>
        ))}
      </div>

      <div style={S.actions}>
        <button style={S.btn('#4f46e5')} onClick={() => navigate('/admin/clinics')}>Manage Clinics</button>
        <button style={S.btn('#059669')} onClick={() => navigate('/admin/staff/register')}>Register Staff</button>
        <button style={S.btn('#0891b2')} onClick={() => navigate('/admin/staff')}>View All Staff</button>
        <button style={S.btn('#ea580c')} onClick={() => navigate('/admin/patients')}>View All Patients</button>
        {stats.pending_approvals > 0 && (
          <button style={S.btn('#dc2626')} onClick={() => navigate('/admin/patients?approval_status=pending')}>
            Approve Patients ({stats.pending_approvals})
          </button>
        )}
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>Clinic Breakdown</div>
        {!clinic_breakdown.length ? (
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>No clinics yet</p>
        ) : (
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Clinic</th>
              <th style={S.th}>Location</th>
              <th style={S.th}>Staff</th>
              <th style={S.th}>Patients</th>
              <th style={S.th}>Status</th>
            </tr></thead>
            <tbody>
              {clinic_breakdown.map(c => (
                <tr key={c.clinic_id}>
                  <td style={{ ...S.td, fontWeight: '600' }}>{c.clinic_name}</td>
                  <td style={S.td}>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                  <td style={S.td}>{c.staff_count}</td>
                  <td style={S.td}>{c.patient_count}</td>
                  <td style={S.td}><span style={S.badge(c.is_active)}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  )
}
