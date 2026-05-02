import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import AdminLayout from '../../components/layout/AdminLayout'

const S = {
  wrap: { maxWidth: '640px' },
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '24px' },
  card: { background: '#fff', borderRadius: '12px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  section: { marginBottom: '20px' },
  sectionTitle: { fontSize: '13px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f3f4f6' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '5px' },
  input: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: '#fff' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  field: { marginBottom: '16px' },
  roleGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' },
  roleBtn: (active) => ({ padding: '10px', border: `2px solid ${active ? '#4f46e5' : '#e5e7eb'}`, borderRadius: '8px', background: active ? '#ede9fe' : '#fff', color: active ? '#4f46e5' : '#374151', fontWeight: '600', fontSize: '13px', cursor: 'pointer', textAlign: 'center' }),
  err: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' },
  actions: { display: 'flex', gap: '10px', marginTop: '24px' },
  saveBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 22px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  cancelBtn: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '10px 22px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
}

const ROLES = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'clinical_assistant', label: 'Clinical Assistant' },
]

const INIT = {
  full_name: '', email: '', password: '', phone: '', city: '', state: '', country: 'India',
  clinic_id: '', specialization: '', license_number: '', hospital_affiliation: '',
  years_of_experience: '', employee_id: '', department: '', designation: '',
}

export default function AdminStaffRegister() {
  const [role, setRole] = useState('doctor')
  const [form, setForm] = useState(INIT)
  const [clinics, setClinics] = useState([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/admin/clinics').then(r => setClinics(r.data.data || [])).catch(() => {})
  }, [])

  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.full_name || !form.email || !form.password) return setErr('Full name, email, and password are required.')
    if (!form.clinic_id) return setErr('Please select a clinic.')
    setSaving(true); setErr('')
    try {
      const payload = { ...form, role }
      if (role !== 'doctor') {
        delete payload.specialization
        delete payload.license_number
        delete payload.hospital_affiliation
        delete payload.years_of_experience
      }
      // Clean empty strings → null so Pydantic validation passes
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null })
      if (payload.years_of_experience) payload.years_of_experience = parseInt(payload.years_of_experience) || null
      else payload.years_of_experience = null

      await api.post('/admin/staff/register', payload)
      navigate('/admin/staff')
    } catch (e) {
      const detail = e.response?.data?.detail
      setErr(Array.isArray(detail) ? detail.map(d => d.msg).join(', ') : (detail || 'Registration failed'))
    } finally { setSaving(false) }
  }

  return (
    <AdminLayout>
      <div style={S.wrap}>
        <h1 style={S.h1}>Register Staff Member</h1>
        <div style={S.card}>
          {err && <div style={S.err}>{err}</div>}

          <div style={S.section}>
            <div style={S.sectionTitle}>Role</div>
            <div style={S.roleGrid}>
              {ROLES.map(r => (
                <button key={r.value} style={S.roleBtn(role === r.value)} onClick={() => setRole(r.value)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}>Account Details</div>
            <div style={S.field}>
              <label style={S.label}>Full Name *</label>
              <input style={S.input} value={form.full_name} onChange={set('full_name')} placeholder="Dr. Jane Smith" />
            </div>
            <div style={S.grid2}>
              <div style={S.field}>
                <label style={S.label}>Email *</label>
                <input style={S.input} type="email" value={form.email} onChange={set('email')} placeholder="jane@clinic.com" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Password *</label>
                <input style={S.input} type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters" />
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>Clinic *</label>
              <select style={S.select} value={form.clinic_id} onChange={set('clinic_id')}>
                <option value="">Select clinic...</option>
                {clinics.map(c => <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>)}
              </select>
            </div>
            <div style={S.grid2}>
              <div style={S.field}>
                <label style={S.label}>Phone</label>
                <input style={S.input} value={form.phone} onChange={set('phone')} placeholder="+91 9876543210" />
              </div>
              <div style={S.field}>
                <label style={S.label}>City</label>
                <input style={S.input} value={form.city} onChange={set('city')} placeholder="Mumbai" />
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>State</label>
              <input style={S.input} value={form.state} onChange={set('state')} placeholder="Maharashtra" />
            </div>
          </div>

          {role === 'doctor' && (
            <div style={S.section}>
              <div style={S.sectionTitle}>Doctor Details</div>
              <div style={S.grid2}>
                <div style={S.field}>
                  <label style={S.label}>Specialization</label>
                  <input style={S.input} value={form.specialization} onChange={set('specialization')} placeholder="Neurology" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>License Number</label>
                  <input style={S.input} value={form.license_number} onChange={set('license_number')} placeholder="MCI-12345" />
                </div>
              </div>
              <div style={S.grid2}>
                <div style={S.field}>
                  <label style={S.label}>Hospital Affiliation</label>
                  <input style={S.input} value={form.hospital_affiliation} onChange={set('hospital_affiliation')} placeholder="Apollo Hospital" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Years of Experience</label>
                  <input style={S.input} type="number" value={form.years_of_experience} onChange={set('years_of_experience')} placeholder="5" min="0" />
                </div>
              </div>
            </div>
          )}

          {(role === 'receptionist' || role === 'clinical_assistant') && (
            <div style={S.section}>
              <div style={S.sectionTitle}>Staff Details</div>
              <div style={S.grid2}>
                <div style={S.field}>
                  <label style={S.label}>Employee ID</label>
                  <input style={S.input} value={form.employee_id} onChange={set('employee_id')} placeholder="EMP-001" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Department</label>
                  <input style={S.input} value={form.department} onChange={set('department')} placeholder="Neurology Dept." />
                </div>
              </div>
              <div style={S.field}>
                <label style={S.label}>Designation</label>
                <input style={S.input} value={form.designation} onChange={set('designation')} placeholder="Senior Receptionist" />
              </div>
            </div>
          )}

          <div style={S.actions}>
            <button style={S.saveBtn} onClick={handleSubmit} disabled={saving}>{saving ? 'Registering...' : 'Register Staff'}</button>
            <button style={S.cancelBtn} onClick={() => navigate('/admin/staff')}>Cancel</button>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
