import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import StaffLayout from '../../components/layout/StaffLayout'

const S = {
  wrap: { maxWidth: '580px' },
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '24px' },
  card: { background: '#fff', borderRadius: '12px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '5px' },
  input: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  textarea: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', minHeight: '80px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  field: { marginBottom: '16px' },
  err: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' },
  actions: { display: 'flex', gap: '10px', marginTop: '24px' },
  saveBtn: { background: '#0891b2', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 22px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  cancelBtn: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '10px 22px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
}

const INIT = { full_name: '', email: '', password: '', phone: '', city: '', state: '', country: 'India', medical_history: '', emergency_contact: '' }

export default function ReceptionistRegisterPatient() {
  const [form, setForm] = useState(INIT)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const navigate = useNavigate()

  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.full_name || !form.email || !form.password) return setErr('Full name, email, and password are required.')
    setSaving(true); setErr('')
    try {
      await api.post('/staff/patients/register', form)
      navigate('/receptionist/patients')
    } catch (e) {
      const detail = e.response?.data?.detail
      setErr(Array.isArray(detail) ? detail.map(d => d.msg).join(', ') : (detail || 'Registration failed'))
    } finally { setSaving(false) }
  }

  return (
    <StaffLayout>
      <div style={S.wrap}>
        <h1 style={S.h1}>Register New Patient</h1>
        <div style={S.card}>
          {err && <div style={S.err}>{err}</div>}
          <div style={S.field}>
            <label style={S.label}>Full Name *</label>
            <input style={S.input} value={form.full_name} onChange={set('full_name')} placeholder="Patient Full Name" />
          </div>
          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>Email *</label>
              <input style={S.input} type="email" value={form.email} onChange={set('email')} placeholder="patient@email.com" />
            </div>
            <div style={S.field}>
              <label style={S.label}>Password *</label>
              <input style={S.input} type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters" />
            </div>
          </div>
          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>Phone</label>
              <input style={S.input} value={form.phone} onChange={set('phone')} placeholder="+91 9876543210" />
            </div>
            <div style={S.field}>
              <label style={S.label}>Emergency Contact</label>
              <input style={S.input} value={form.emergency_contact} onChange={set('emergency_contact')} placeholder="Name: +91 ..." />
            </div>
          </div>
          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>City</label>
              <input style={S.input} value={form.city} onChange={set('city')} placeholder="Mumbai" />
            </div>
            <div style={S.field}>
              <label style={S.label}>State</label>
              <input style={S.input} value={form.state} onChange={set('state')} placeholder="Maharashtra" />
            </div>
          </div>
          <div style={S.field}>
            <label style={S.label}>Medical History</label>
            <textarea style={S.textarea} value={form.medical_history} onChange={set('medical_history')} placeholder="Relevant medical history, current medications, allergies..." />
          </div>
          <div style={S.actions}>
            <button style={S.saveBtn} onClick={handleSubmit} disabled={saving}>{saving ? 'Registering...' : 'Register Patient'}</button>
            <button style={S.cancelBtn} onClick={() => navigate('/receptionist/patients')}>Cancel</button>
          </div>
        </div>
      </div>
    </StaffLayout>
  )
}
