import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const S = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa', padding: '24px' },
  card: { background: '#fff', borderRadius: '12px', padding: '40px', width: '100%', maxWidth: '520px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
  title: { fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px', textAlign: 'center' },
  sub: { color: '#6b7280', fontSize: '14px', textAlign: 'center', marginBottom: '28px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' },
  input: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  group: { marginBottom: '16px' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  btn: { width: '100%', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' },
  err: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' },
  roleBtn: (active) => ({
    flex: 1, padding: '10px', border: `2px solid ${active ? '#4f46e5' : '#d1d5db'}`,
    background: active ? '#eef2ff' : '#fff', borderRadius: '8px', cursor: 'pointer',
    fontWeight: active ? '700' : '500', color: active ? '#4f46e5' : '#374151', fontSize: '14px',
  }),
  sectionTitle: { fontSize: '13px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '20px' },
}

export default function RegisterPage() {
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', confirmPassword: '',
    phone: '', city: '', state: '', role: 'patient',
    specialization: '', license_number: '',
    medical_history: '',
    employee_id: '', department: '', designation: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { register } = useAuthStore()
  const navigate = useNavigate()

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      const profile = await register(form)
      const roleRedirects = {
        doctor: '/doctor/dashboard',
        receptionist: '/receptionist/dashboard',
        clinical_assistant: '/clinical-assistant/dashboard',
        admin: '/doctor/dashboard',
      }
      navigate(roleRedirects[profile.role] || '/patient/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h1 style={S.title}>Create Account</h1>
        <p style={S.sub}>Join NeuroWellness</p>

        {error && <div style={S.err}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <p style={S.sectionTitle}>Account Type</p>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button type="button" style={S.roleBtn(form.role === 'patient')} onClick={() => setForm(f => ({ ...f, role: 'patient' }))}>Patient</button>
            <button type="button" style={S.roleBtn(form.role === 'doctor')} onClick={() => setForm(f => ({ ...f, role: 'doctor' }))}>Doctor</button>
            <button type="button" style={S.roleBtn(form.role === 'receptionist')} onClick={() => setForm(f => ({ ...f, role: 'receptionist' }))}>Receptionist</button>
            <button type="button" style={S.roleBtn(form.role === 'clinical_assistant')} onClick={() => setForm(f => ({ ...f, role: 'clinical_assistant' }))}>Clinical Assistant</button>
            <button type="button" style={S.roleBtn(form.role === 'admin')} onClick={() => setForm(f => ({ ...f, role: 'admin' }))}>Admin</button>
          </div>

          <p style={S.sectionTitle}>Basic Info</p>
          <div style={S.group}>
            <label style={S.label}>Full Name *</label>
            <input style={S.input} value={form.full_name} onChange={set('full_name')} required placeholder="Dr. Jane Smith" />
          </div>
          <div style={S.row}>
            <div style={S.group}>
              <label style={S.label}>Email *</label>
              <input style={S.input} type="email" value={form.email} onChange={set('email')} required placeholder="you@example.com" />
            </div>
            <div style={S.group}>
              <label style={S.label}>Phone</label>
              <input style={S.input} value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
            </div>
          </div>
          <div style={S.row}>
            <div style={S.group}>
              <label style={S.label}>City</label>
              <input style={S.input} value={form.city} onChange={set('city')} placeholder="Mumbai" />
            </div>
            <div style={S.group}>
              <label style={S.label}>State</label>
              <input style={S.input} value={form.state} onChange={set('state')} placeholder="Maharashtra" />
            </div>
          </div>
          <div style={S.row}>
            <div style={S.group}>
              <label style={S.label}>Password *</label>
              <input style={S.input} type="password" value={form.password} onChange={set('password')} required placeholder="min 6 chars" />
            </div>
            <div style={S.group}>
              <label style={S.label}>Confirm Password *</label>
              <input style={S.input} type="password" value={form.confirmPassword} onChange={set('confirmPassword')} required placeholder="••••••••" />
            </div>
          </div>

          {form.role === 'doctor' && (
            <>
              <p style={S.sectionTitle}>Professional Info</p>
              <div style={S.row}>
                <div style={S.group}>
                  <label style={S.label}>Specialization</label>
                  <input style={S.input} value={form.specialization} onChange={set('specialization')} placeholder="Neurology" />
                </div>
                <div style={S.group}>
                  <label style={S.label}>License Number</label>
                  <input style={S.input} value={form.license_number} onChange={set('license_number')} placeholder="MCI-12345" />
                </div>
              </div>
            </>
          )}

          {form.role === 'patient' && (
            <>
              <p style={S.sectionTitle}>Health Info</p>
              <div style={S.group}>
                <label style={S.label}>Medical History (optional)</label>
                <textarea style={{ ...S.input, minHeight: '70px', resize: 'vertical' }} value={form.medical_history} onChange={set('medical_history')} placeholder="Any relevant medical history..." />
              </div>
            </>
          )}

          {(form.role === 'receptionist' || form.role === 'clinical_assistant' || form.role === 'admin') && (
            <>
              <p style={S.sectionTitle}>Staff Info</p>
              <div style={S.row}>
                <div style={S.group}>
                  <label style={S.label}>Employee ID</label>
                  <input style={S.input} value={form.employee_id} onChange={set('employee_id')} placeholder="EMP-001" />
                </div>
                <div style={S.group}>
                  <label style={S.label}>Department</label>
                  <input style={S.input} value={form.department} onChange={set('department')} placeholder="Neurology" />
                </div>
              </div>
              <div style={S.group}>
                <label style={S.label}>Designation</label>
                <input style={S.input} value={form.designation} onChange={set('designation')} placeholder="e.g. Senior Clinical Assistant" />
              </div>
            </>
          )}

          <button style={S.btn} type="submit" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#6b7280' }}>
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </div>
    </div>
  )
}
