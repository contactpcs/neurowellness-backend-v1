import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import api from '../../lib/api'

const S = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa', padding: '24px' },
  card: { background: '#fff', borderRadius: '12px', padding: '40px', width: '100%', maxWidth: '520px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
  title: { fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px', textAlign: 'center' },
  sub: { color: '#6b7280', fontSize: '14px', textAlign: 'center', marginBottom: '28px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' },
  input: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: '#fff' },
  group: { marginBottom: '16px' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  btn: (disabled) => ({
    width: '100%', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px',
    padding: '12px', fontSize: '15px', fontWeight: '600', marginTop: '8px',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
  }),
  err: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' },
  success: { background: '#f0fdf4', border: '1px solid #86efac', color: '#16a34a', borderRadius: '8px', padding: '14px', fontSize: '13px', marginBottom: '16px', textAlign: 'center', lineHeight: '1.6' },
  roleBtn: (active) => ({
    flex: 1, padding: '10px', border: `2px solid ${active ? '#4f46e5' : '#d1d5db'}`,
    background: active ? '#eef2ff' : '#fff', borderRadius: '8px', cursor: 'pointer',
    fontWeight: active ? '700' : '500', color: active ? '#4f46e5' : '#374151', fontSize: '14px',
  }),
  sectionTitle: { fontSize: '13px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '20px' },
  consentBox: { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginBottom: '12px' },
  consentHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  consentTitle: { fontSize: '14px', fontWeight: '700', color: '#111827' },
  requiredBadge: { background: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', flexShrink: 0 },
  consentPoint: { fontSize: '13px', color: '#4b5563', marginBottom: '6px', lineHeight: '1.5', paddingLeft: '4px' },
  consentCheckRow: { display: 'flex', gap: '10px', alignItems: 'flex-start', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e5e7eb' },
  checkboxLabel: { fontSize: '13px', color: '#374151', lineHeight: '1.5', cursor: 'pointer', userSelect: 'none' },
}

const CONSENT_CONTENT = {
  'Data Privacy and Security Form': [
    'I consent to the collection and processing of my personal health data in accordance with applicable data protection laws.',
    'I understand my data may be shared with assigned healthcare professionals within this clinic only.',
    'I acknowledge I can request deletion of my data at any time by contacting the clinic.',
  ],
  'Treatment and Care Consent Form': [
    'I consent to receive assessment, treatment, and care services provided by NeuroWellness.',
    'I understand that treatment plans may be updated by my assigned doctor based on assessments.',
  ],
  'Telehealth Services Consent Form': [
    'I consent to receiving healthcare services via telehealth/video consultation.',
    'I understand telehealth sessions are not a replacement for emergency in-person care.',
  ],
}

export default function RegisterPage() {
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', confirmPassword: '',
    phone: '', city: '', state: '', role: 'patient',
    specialization: '', license_number: '',
    medical_history: '',
    employee_id: '', department: '', designation: '',
    date_of_birth: '', gender: '', clinic_id: '',
  })
  const [clinics, setClinics] = useState([])
  const [clinicsLoading, setClinicsLoading] = useState(false)
  const [clinicsError, setClinicsError] = useState('')
  const [consentForms, setConsentForms] = useState([])
  const [consentChecked, setConsentChecked] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const { register } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (form.role !== 'patient') return
    setClinicsLoading(true)
    setClinicsError('')
    api.get('/auth/clinics')
      .then(res => setClinics(res.data.data || []))
      .catch(err => setClinicsError(err.response?.data?.detail || 'Failed to load clinics. Check if backend is running.'))
      .finally(() => setClinicsLoading(false))
  }, [form.role])

  useEffect(() => {
    if (form.role !== 'patient') return
    api.get('/consent/forms').then(res => {
      const forms = res.data.data || []
      setConsentForms(forms)
      const init = {}
      forms.forEach(f => { init[f.consent_form_id] = false })
      setConsentChecked(init)
    }).catch(() => {})
  }, [form.role])

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))
  const toggleConsent = (id) => setConsentChecked(prev => ({ ...prev, [id]: !prev[id] }))

  const allRequiredAccepted = consentForms
    .filter(f => f.is_required)
    .every(f => consentChecked[f.consent_form_id])

  const isPatient = form.role === 'patient'
  const submitDisabled = loading || (isPatient && !allRequiredAccepted)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (isPatient && !form.clinic_id) { setError('Please select your nearest clinic'); return }
    if (isPatient && !form.date_of_birth) { setError('Date of birth is required'); return }
    if (isPatient && !form.gender) { setError('Gender is required'); return }
    if (isPatient && !allRequiredAccepted) { setError('Please accept all required consent forms to continue'); return }

    const consent_responses = consentForms.map(f => ({
      consent_form_id: f.consent_form_id,
      response: !!consentChecked[f.consent_form_id],
    }))

    setLoading(true)
    try {
      await register({ ...form, consent_responses })
      setSuccess('Registration submitted successfully! Your account is pending approval by your clinic. You will be redirected to login.')
      setTimeout(() => navigate('/login', { replace: true }), 3000)
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
        {success && <div style={S.success}>{success}</div>}

        <form onSubmit={handleSubmit}>
          <p style={S.sectionTitle}>Account Type</p>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {['patient', 'doctor', 'receptionist', 'clinical_assistant', 'admin'].map(r => (
              <button key={r} type="button" style={S.roleBtn(form.role === r)}
                onClick={() => setForm(f => ({ ...f, role: r }))}>
                {r === 'clinical_assistant' ? 'Clinical Assistant' : r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>

          <p style={S.sectionTitle}>Basic Info</p>
          <div style={S.group}>
            <label style={S.label}>Full Name *</label>
            <input style={S.input} value={form.full_name} onChange={set('full_name')} required placeholder="Jane Smith" />
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
                <input style={S.input} value={form.designation} onChange={set('designation')} placeholder="Senior Clinical Assistant" />
              </div>
            </>
          )}

          {isPatient && (
            <>
              <p style={S.sectionTitle}>Patient Info</p>
              <div style={S.row}>
                <div style={S.group}>
                  <label style={S.label}>Date of Birth *</label>
                  <input style={S.input} type="date" value={form.date_of_birth} onChange={set('date_of_birth')} required />
                </div>
                <div style={S.group}>
                  <label style={S.label}>Gender *</label>
                  <select style={S.select} value={form.gender} onChange={set('gender')} required>
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div style={S.group}>
                <label style={S.label}>Select Clinic *</label>
                {clinicsError
                  ? <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '4px' }}>{clinicsError}</p>
                  : (
                    <select style={S.select} value={form.clinic_id} onChange={set('clinic_id')} required disabled={clinicsLoading}>
                      <option value="">
                        {clinicsLoading ? 'Loading clinics...' : clinics.length === 0 ? 'No clinics available' : 'Select your nearest clinic...'}
                      </option>
                      {clinics.map(c => (
                        <option key={c.clinic_id} value={c.clinic_id}>
                          {c.clinic_name} — {c.city}, {c.state}
                        </option>
                      ))}
                    </select>
                  )
                }
              </div>

              <div style={S.group}>
                <label style={S.label}>Medical History (optional)</label>
                <textarea style={{ ...S.input, minHeight: '70px', resize: 'vertical' }}
                  value={form.medical_history} onChange={set('medical_history')}
                  placeholder="Any relevant medical history..." />
              </div>

              {consentForms.length > 0 && (
                <>
                  <p style={S.sectionTitle}>Consent Forms</p>
                  <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                    Please read and accept the following forms to complete registration.
                  </p>
                  {consentForms.map(f => (
                    <div key={f.consent_form_id} style={S.consentBox}>
                      <div style={S.consentHeader}>
                        <span style={S.consentTitle}>{f.consent_form_name}</span>
                        {f.is_required && <span style={S.requiredBadge}>Required</span>}
                      </div>
                      {(CONSENT_CONTENT[f.consent_form_name] || []).map((point, i) => (
                        <p key={i} style={S.consentPoint}>• {point}</p>
                      ))}
                      <div style={S.consentCheckRow}>
                        <input
                          type="checkbox"
                          id={`consent-${f.consent_form_id}`}
                          checked={!!consentChecked[f.consent_form_id]}
                          onChange={() => toggleConsent(f.consent_form_id)}
                          style={{ width: '16px', height: '16px', marginTop: '1px', cursor: 'pointer', accentColor: '#4f46e5', flexShrink: 0 }}
                        />
                        <label htmlFor={`consent-${f.consent_form_id}`} style={S.checkboxLabel}>
                          I have read and accept the <strong>{f.consent_form_name}</strong>
                          {f.is_required ? ' (Required)' : ' (Optional)'}
                        </label>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          <button style={S.btn(submitDisabled)} type="submit" disabled={submitDisabled}>
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
