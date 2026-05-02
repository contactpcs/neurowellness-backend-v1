import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../../lib/api'
import AdminLayout from '../../components/layout/AdminLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const STATUS_COLORS = { approved: '#059669', pending: '#ca8a04', rejected: '#dc2626' }
const STATUS_BG = { approved: '#dcfce7', pending: '#fef9c3', rejected: '#fee2e2' }

const S = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' },
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827' },
  registerBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  filters: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' },
  select: { border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', outline: 'none', background: '#fff' },
  search: { border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 14px', fontSize: '14px', outline: 'none', width: '220px' },
  card: { background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '12px 16px', background: '#f9fafb', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '12px 16px', borderBottom: '1px solid #f3f4f6', color: '#374151', verticalAlign: 'middle' },
  statusBadge: (status) => ({ display: 'inline-block', background: STATUS_BG[status] || '#f3f4f6', color: STATUS_COLORS[status] || '#6b7280', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '600' }),
  btn: (color) => ({ background: color, color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginRight: '4px' }),
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modalCard: { background: '#fff', borderRadius: '12px', padding: '32px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '5px' },
  input: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px' },
  selectFull: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px', background: '#fff' },
  textarea: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', minHeight: '70px', marginBottom: '12px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  saveBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', marginRight: '10px' },
  cancelBtn: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  err: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', marginBottom: '12px' },
}

const EMPTY_FORM = { full_name: '', email: '', password: '', phone: '', city: '', state: '', country: 'India', clinic_id: '', medical_history: '', emergency_contact: '' }

export default function AdminPatientList() {
  const [patients, setPatients] = useState([])
  const [clinics, setClinics] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [clinicFilter, setClinicFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const location = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const s = params.get('approval_status')
    if (s) setStatusFilter(s)
  }, [])

  useEffect(() => {
    api.get('/admin/clinics').then(r => setClinics(r.data.data || [])).catch(() => {})
  }, [])

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (clinicFilter) params.set('clinic_id', clinicFilter)
    if (statusFilter) params.set('approval_status', statusFilter)
    api.get(`/admin/patients?${params}&limit=100`)
      .then(r => setPatients(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [clinicFilter, statusFilter])

  const handleApprove = async (p) => {
    try { await api.put(`/admin/patients/${p.id}/approve`); load() }
    catch (e) { alert(e.response?.data?.detail || 'Approve failed') }
  }

  const handleReject = async (p) => {
    if (!confirm(`Reject ${p.full_name}?`)) return
    try { await api.put(`/admin/patients/${p.id}/reject`); load() }
    catch (e) { alert(e.response?.data?.detail || 'Reject failed') }
  }

  const handleDelete = async (p) => {
    if (!confirm(`Permanently delete ${p.full_name}? This cannot be undone.`)) return
    try { await api.delete(`/admin/patients/${p.id}`); load() }
    catch (e) { alert(e.response?.data?.detail || 'Delete failed') }
  }

  const setF = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }))

  const handleRegister = async () => {
    if (!form.full_name || !form.email || !form.password) return setErr('Full name, email and password are required.')
    if (!form.clinic_id) return setErr('Please select a clinic.')
    setSaving(true); setErr('')
    try {
      await api.post('/staff/patients/register', form)
      setShowAdd(false); setForm(EMPTY_FORM); load()
    } catch (e) {
      const detail = e.response?.data?.detail
      setErr(Array.isArray(detail) ? detail.map(d => d.msg).join(', ') : (detail || 'Registration failed'))
    } finally { setSaving(false) }
  }

  const filtered = patients.filter(p =>
    (p.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.email || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AdminLayout>
      <div style={S.header}>
        <h1 style={S.h1}>All Patients ({patients.length})</h1>
        <button style={S.registerBtn} onClick={() => { setShowAdd(true); setErr('') }}>+ Add Patient</button>
      </div>

      <div style={S.filters}>
        <input style={S.search} placeholder="Search name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={S.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
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
              <th style={S.th}>Patient</th>
              <th style={S.th}>Clinic</th>
              <th style={S.th}>Assigned Doctor</th>
              <th style={S.th}>Location</th>
              <th style={S.th}>Approval</th>
              <th style={S.th}>Registered</th>
              <th style={S.th}>Actions</th>
            </tr></thead>
            <tbody>
              {!filtered.length ? (
                <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#9ca3af' }}>No patients found</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id}>
                  <td style={S.td}>
                    <div style={{ fontWeight: '600' }}>{p.full_name || '—'}</div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>{p.email || '—'}</div>
                  </td>
                  <td style={S.td}>{p.clinic_name || '—'}</td>
                  <td style={S.td}>{p.assigned_doctor_name || '—'}</td>
                  <td style={S.td}>{[p.city, p.state].filter(Boolean).join(', ') || '—'}</td>
                  <td style={S.td}><span style={S.statusBadge(p.approval_status)}>{p.approval_status || '—'}</span></td>
                  <td style={S.td}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                  <td style={S.td}>
                    {p.approval_status === 'pending' && <>
                      <button style={S.btn('#059669')} onClick={() => handleApprove(p)}>Approve</button>
                      <button style={S.btn('#dc2626')} onClick={() => handleReject(p)}>Reject</button>
                    </>}
                    {p.approval_status === 'rejected' && (
                      <button style={S.btn('#059669')} onClick={() => handleApprove(p)}>Re-approve</button>
                    )}
                    <button style={S.btn('#6b7280')} onClick={() => handleDelete(p)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div style={S.modal}>
          <div style={S.modalCard}>
            <h2 style={{ fontWeight: '700', fontSize: '18px', marginBottom: '20px' }}>Add Patient</h2>
            {err && <div style={S.err}>{err}</div>}
            <label style={S.label}>Full Name *</label>
            <input style={S.input} value={form.full_name} onChange={setF('full_name')} placeholder="Patient Full Name" />
            <div style={S.grid2}>
              <div>
                <label style={S.label}>Email *</label>
                <input style={S.input} type="email" value={form.email} onChange={setF('email')} placeholder="patient@email.com" />
              </div>
              <div>
                <label style={S.label}>Password *</label>
                <input style={S.input} type="password" value={form.password} onChange={setF('password')} placeholder="Min. 8 characters" />
              </div>
            </div>
            <label style={S.label}>Clinic *</label>
            <select style={S.selectFull} value={form.clinic_id} onChange={setF('clinic_id')}>
              <option value="">Select clinic...</option>
              {clinics.map(c => <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>)}
            </select>
            <div style={S.grid2}>
              <div>
                <label style={S.label}>Phone</label>
                <input style={S.input} value={form.phone} onChange={setF('phone')} placeholder="+91 9876543210" />
              </div>
              <div>
                <label style={S.label}>Emergency Contact</label>
                <input style={S.input} value={form.emergency_contact} onChange={setF('emergency_contact')} placeholder="Name: +91..." />
              </div>
            </div>
            <div style={S.grid2}>
              <div>
                <label style={S.label}>City</label>
                <input style={S.input} value={form.city} onChange={setF('city')} placeholder="Mumbai" />
              </div>
              <div>
                <label style={S.label}>State</label>
                <input style={S.input} value={form.state} onChange={setF('state')} placeholder="Maharashtra" />
              </div>
            </div>
            <label style={S.label}>Medical History</label>
            <textarea style={S.textarea} value={form.medical_history} onChange={setF('medical_history')} placeholder="Relevant medical history..." />
            <div>
              <button style={S.saveBtn} onClick={handleRegister} disabled={saving}>{saving ? 'Registering...' : 'Register Patient'}</button>
              <button style={S.cancelBtn} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
