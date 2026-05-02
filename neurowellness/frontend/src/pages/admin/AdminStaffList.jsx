import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import AdminLayout from '../../components/layout/AdminLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const ROLE_COLORS = { doctor: '#4f46e5', receptionist: '#0891b2', clinical_assistant: '#7c3aed' }

const S = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' },
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827' },
  filters: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' },
  select: { border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', outline: 'none' },
  search: { border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 14px', fontSize: '14px', outline: 'none', width: '220px' },
  card: { background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '12px 16px', background: '#f9fafb', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '12px 16px', borderBottom: '1px solid #f3f4f6', color: '#374151', verticalAlign: 'middle' },
  roleBadge: (role) => ({ display: 'inline-block', background: (ROLE_COLORS[role] || '#6b7280') + '20', color: ROLE_COLORS[role] || '#6b7280', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '600' }),
  statusBadge: (active) => ({ display: 'inline-block', background: active ? '#dcfce7' : '#fee2e2', color: active ? '#16a34a' : '#dc2626', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '600' }),
  btn: (color) => ({ background: color, color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginRight: '4px' }),
  registerBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
}

export default function AdminStaffList() {
  const [staff, setStaff] = useState([])
  const [clinics, setClinics] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [clinicFilter, setClinicFilter] = useState('')
  const navigate = useNavigate()

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (roleFilter) params.set('role', roleFilter)
    if (clinicFilter) params.set('clinic_id', clinicFilter)
    api.get(`/admin/staff?${params}&limit=100`)
      .then(r => setStaff(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    api.get('/admin/clinics').then(r => setClinics(r.data.data || [])).catch(() => {})
  }, [])

  useEffect(() => { load() }, [roleFilter, clinicFilter])

  const handleToggle = async (s) => {
    const endpoint = s.is_active ? 'deactivate' : 'reactivate'
    try {
      await api.put(`/admin/staff/${s.id}/${endpoint}`)
      load()
    } catch (e) { alert(e.response?.data?.detail || 'Action failed') }
  }

  const handleDelete = async (s) => {
    if (!confirm(`Delete ${s.full_name}? This cannot be undone.`)) return
    try {
      await api.delete(`/admin/staff/${s.id}`)
      load()
    } catch (e) { alert(e.response?.data?.detail || 'Delete failed') }
  }

  const filtered = staff.filter(s =>
    (s.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AdminLayout>
      <div style={S.header}>
        <h1 style={S.h1}>All Staff ({staff.length})</h1>
        <button style={S.registerBtn} onClick={() => navigate('/admin/staff/register')}>+ Register Staff</button>
      </div>

      <div style={S.filters}>
        <input style={S.search} placeholder="Search name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={S.select} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          <option value="doctor">Doctor</option>
          <option value="receptionist">Receptionist</option>
          <option value="clinical_assistant">Clinical Assistant</option>
        </select>
        <select style={S.select} value={clinicFilter} onChange={e => setClinicFilter(e.target.value)}>
          <option value="">All Clinics</option>
          {clinics.map(c => <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>)}
        </select>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div style={S.card}>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Name</th>
              <th style={S.th}>Role</th>
              <th style={S.th}>Clinic</th>
              <th style={S.th}>Department</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Actions</th>
            </tr></thead>
            <tbody>
              {!filtered.length ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#9ca3af' }}>No staff found</td></tr>
              ) : filtered.map(s => (
                <tr key={s.id}>
                  <td style={S.td}>
                    <div style={{ fontWeight: '600' }}>{s.full_name}</div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>{s.email}</div>
                  </td>
                  <td style={S.td}><span style={S.roleBadge(s.role)}>{s.role.replace('_', ' ')}</span></td>
                  <td style={S.td}>{s.clinic_name || '—'}</td>
                  <td style={S.td}>{s.department || '—'}</td>
                  <td style={S.td}><span style={S.statusBadge(s.is_active)}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td style={S.td}>
                    <button style={S.btn('#4f46e5')} onClick={() => navigate(`/admin/staff/${s.id}/edit`)}>Edit</button>
                    <button style={S.btn(s.is_active ? '#ea580c' : '#059669')} onClick={() => handleToggle(s)}>
                      {s.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button style={S.btn('#dc2626')} onClick={() => handleDelete(s)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  )
}
