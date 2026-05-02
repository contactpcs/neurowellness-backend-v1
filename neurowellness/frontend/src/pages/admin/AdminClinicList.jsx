import { useEffect, useState } from 'react'
import api from '../../lib/api'
import AdminLayout from '../../components/layout/AdminLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const S = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827' },
  addBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  card: { background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '12px 16px', background: '#f9fafb', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '12px 16px', borderBottom: '1px solid #f3f4f6', color: '#374151', verticalAlign: 'middle' },
  badge: (active) => ({ display: 'inline-block', background: active ? '#dcfce7' : '#fee2e2', color: active ? '#16a34a' : '#dc2626', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '600' }),
  actionBtn: (color) => ({ background: color, color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginRight: '6px' }),
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modalCard: { background: '#fff', borderRadius: '12px', padding: '32px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' },
  input: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  saveBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', marginRight: '10px' },
  cancelBtn: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  err: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', marginBottom: '12px' },
}

const EMPTY_FORM = { clinic_name: '', owner_name: '', address: '', city: '', state: '', phone: '', email: '' }

export default function AdminClinicList() {
  const [clinics, setClinics] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = () => {
    setLoading(true)
    api.get('/admin/clinics')
      .then(r => setClinics(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openEdit = (c) => {
    setEditing(c.clinic_id)
    setEditForm({ clinic_name: c.clinic_name, owner_name: c.owner_name, address: c.address || '', phone: c.phone || '', email: c.email || '', city: c.city || '', state: c.state || '' })
    setErr('')
  }

  const openAdd = () => {
    setEditing('new')
    setEditForm(EMPTY_FORM)
    setErr('')
  }

  const handleSave = async () => {
    setSaving(true); setErr('')
    try {
      if (editing === 'new') {
        await api.post('/admin/clinics', editForm)
      } else {
        await api.put(`/admin/clinics/${editing}`, editForm)
      }
      setEditing(null)
      load()
    } catch (e) {
      const detail = e.response?.data?.detail
      setErr(Array.isArray(detail) ? detail.map(d => d.msg).join(', ') : (detail || 'Save failed'))
    } finally { setSaving(false) }
  }

  const handleToggle = async (c) => {
    const endpoint = c.is_active ? 'deactivate' : 'activate'
    try {
      await api.put(`/admin/clinics/${c.clinic_id}/${endpoint}`)
      load()
    } catch (e) { alert(e.response?.data?.detail || 'Action failed') }
  }

  const setF = (f) => (e) => setEditForm(prev => ({ ...prev, [f]: e.target.value }))

  return (
    <AdminLayout>
      <div style={S.header}>
        <h1 style={S.h1}>All Clinics ({clinics.length})</h1>
        <button style={S.addBtn} onClick={openAdd}>+ Add Clinic</button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div style={S.card}>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Clinic Name</th>
              <th style={S.th}>Owner</th>
              <th style={S.th}>Location</th>
              <th style={S.th}>Contact</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Actions</th>
            </tr></thead>
            <tbody>
              {!clinics.length ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#9ca3af' }}>No clinics yet. Click "+ Add Clinic" to create one.</td></tr>
              ) : clinics.map(c => (
                <tr key={c.clinic_id}>
                  <td style={{ ...S.td, fontWeight: '600' }}>{c.clinic_name}</td>
                  <td style={S.td}>{c.owner_name}</td>
                  <td style={S.td}>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                  <td style={S.td}>{c.phone || c.email || '—'}</td>
                  <td style={S.td}><span style={S.badge(c.is_active)}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td style={S.td}>
                    <button style={S.actionBtn('#4f46e5')} onClick={() => openEdit(c)}>Edit</button>
                    <button style={S.actionBtn(c.is_active ? '#dc2626' : '#059669')} onClick={() => handleToggle(c)}>
                      {c.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div style={S.modal}>
          <div style={S.modalCard}>
            <h2 style={{ fontWeight: '700', fontSize: '18px', marginBottom: '20px' }}>
              {editing === 'new' ? 'Add New Clinic' : 'Edit Clinic'}
            </h2>
            {err && <div style={S.err}>{err}</div>}
            <label style={S.label}>Clinic Name *</label>
            <input style={S.input} value={editForm.clinic_name} onChange={setF('clinic_name')} placeholder="e.g. NeuroWellness Mumbai" />
            <label style={S.label}>Owner Name *</label>
            <input style={S.input} value={editForm.owner_name} onChange={setF('owner_name')} placeholder="e.g. Dr. Sharma" />
            <label style={S.label}>Address</label>
            <input style={S.input} value={editForm.address} onChange={setF('address')} placeholder="Street address" />
            <div style={S.row}>
              <div><label style={S.label}>City</label><input style={S.input} value={editForm.city} onChange={setF('city')} placeholder="Mumbai" /></div>
              <div><label style={S.label}>State</label><input style={S.input} value={editForm.state} onChange={setF('state')} placeholder="Maharashtra" /></div>
            </div>
            <div style={S.row}>
              <div><label style={S.label}>Phone</label><input style={S.input} value={editForm.phone} onChange={setF('phone')} placeholder="+91 9876543210" /></div>
              <div><label style={S.label}>Email</label><input style={S.input} value={editForm.email} onChange={setF('email')} placeholder="clinic@email.com" /></div>
            </div>
            <div style={{ marginTop: '4px' }}>
              <button style={S.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing === 'new' ? 'Create Clinic' : 'Save'}</button>
              <button style={S.cancelBtn} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
