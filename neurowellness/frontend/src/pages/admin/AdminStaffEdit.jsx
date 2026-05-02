import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../lib/api'
import AdminLayout from '../../components/layout/AdminLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const S = {
  wrap: { maxWidth: '640px' },
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '24px' },
  card: { background: '#fff', borderRadius: '12px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  section: { marginBottom: '20px' },
  sectionTitle: { fontSize: '13px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f3f4f6' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '5px' },
  input: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  readOnly: { width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', background: '#f9fafb', color: '#6b7280', boxSizing: 'border-box' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  field: { marginBottom: '16px' },
  roleBadge: (role) => {
    const colors = { doctor: '#4f46e5', receptionist: '#0891b2', clinical_assistant: '#7c3aed' }
    const c = colors[role] || '#6b7280'
    return { display: 'inline-block', background: c + '20', color: c, borderRadius: '12px', padding: '3px 12px', fontSize: '13px', fontWeight: '600' }
  },
  err: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' },
  actions: { display: 'flex', gap: '10px', marginTop: '24px' },
  saveBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 22px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  cancelBtn: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '10px 22px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
}

export default function AdminStaffEdit() {
  const { staffId } = useParams()
  const navigate = useNavigate()
  const [staff, setStaff] = useState(null)
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get(`/admin/staff/${staffId}`)
      .then(r => {
        const s = r.data.data
        setStaff(s)
        setForm({
          full_name: s.full_name || '',
          phone: s.phone || '',
          city: s.city || '',
          state: s.state || '',
          specialization: s.specialization || '',
          license_number: s.license_number || '',
          hospital_affiliation: s.hospital_affiliation || '',
          years_of_experience: s.years_of_experience ?? '',
          employee_id: s.employee_id || '',
          department: s.department || '',
          designation: s.designation || '',
          availability: s.availability || 'available',
        })
      })
      .catch(() => setErr('Failed to load staff member'))
      .finally(() => setLoading(false))
  }, [staffId])

  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }))

  const handleSave = async () => {
    if (!form.full_name) return setErr('Full name is required.')
    setSaving(true); setErr('')
    try {
      const payload = { ...form }
      if (payload.years_of_experience !== '') payload.years_of_experience = parseInt(payload.years_of_experience) || null
      else payload.years_of_experience = null
      await api.put(`/admin/staff/${staffId}`, payload)
      navigate('/admin/staff')
    } catch (e) {
      const detail = e.response?.data?.detail
      setErr(Array.isArray(detail) ? detail.map(d => d.msg).join(', ') : (detail || 'Update failed'))
    } finally { setSaving(false) }
  }

  if (loading) return <AdminLayout><LoadingSpinner /></AdminLayout>

  return (
    <AdminLayout>
      <div style={S.wrap}>
        <h1 style={S.h1}>Edit Staff Member</h1>
        <div style={S.card}>
          {err && <div style={S.err}>{err}</div>}

          {staff && (
            <div style={S.section}>
              <div style={S.sectionTitle}>Account Info</div>
              <div style={S.grid2}>
                <div style={S.field}>
                  <label style={S.label}>Email</label>
                  <div style={S.readOnly}>{staff.email}</div>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Role</label>
                  <div><span style={S.roleBadge(staff.role)}>{staff.role.replace('_', ' ')}</span></div>
                </div>
              </div>
              <div style={S.field}>
                <label style={S.label}>Clinic</label>
                <div style={S.readOnly}>{staff.clinic_name || '—'}</div>
              </div>
            </div>
          )}

          <div style={S.section}>
            <div style={S.sectionTitle}>Personal Details</div>
            <div style={S.field}>
              <label style={S.label}>Full Name *</label>
              <input style={S.input} value={form.full_name} onChange={set('full_name')} />
            </div>
            <div style={S.grid2}>
              <div style={S.field}>
                <label style={S.label}>Phone</label>
                <input style={S.input} value={form.phone} onChange={set('phone')} />
              </div>
              <div style={S.field}>
                <label style={S.label}>City</label>
                <input style={S.input} value={form.city} onChange={set('city')} />
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>State</label>
              <input style={S.input} value={form.state} onChange={set('state')} />
            </div>
          </div>

          {staff?.role === 'doctor' && (
            <div style={S.section}>
              <div style={S.sectionTitle}>Doctor Details</div>
              <div style={S.grid2}>
                <div style={S.field}>
                  <label style={S.label}>Specialization</label>
                  <input style={S.input} value={form.specialization} onChange={set('specialization')} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>License Number</label>
                  <input style={S.input} value={form.license_number} onChange={set('license_number')} />
                </div>
              </div>
              <div style={S.grid2}>
                <div style={S.field}>
                  <label style={S.label}>Hospital Affiliation</label>
                  <input style={S.input} value={form.hospital_affiliation} onChange={set('hospital_affiliation')} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Years of Experience</label>
                  <input style={S.input} type="number" value={form.years_of_experience} onChange={set('years_of_experience')} min="0" />
                </div>
              </div>
              <div style={S.field}>
                <label style={S.label}>Availability</label>
                <select style={{ ...S.input, background: '#fff' }} value={form.availability} onChange={set('availability')}>
                  <option value="available">Available</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </div>
            </div>
          )}

          {(staff?.role === 'receptionist' || staff?.role === 'clinical_assistant') && (
            <div style={S.section}>
              <div style={S.sectionTitle}>Staff Details</div>
              <div style={S.grid2}>
                <div style={S.field}>
                  <label style={S.label}>Employee ID</label>
                  <input style={S.input} value={form.employee_id} onChange={set('employee_id')} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Department</label>
                  <input style={S.input} value={form.department} onChange={set('department')} />
                </div>
              </div>
              <div style={S.field}>
                <label style={S.label}>Designation</label>
                <input style={S.input} value={form.designation} onChange={set('designation')} />
              </div>
            </div>
          )}

          <div style={S.actions}>
            <button style={S.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            <button style={S.cancelBtn} onClick={() => navigate('/admin/staff')}>Cancel</button>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
