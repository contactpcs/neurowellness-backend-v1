import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const S = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa' },
  card: { background: '#fff', borderRadius: '12px', padding: '40px', width: '100%', maxWidth: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
  title: { fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px', textAlign: 'center' },
  sub: { color: '#6b7280', fontSize: '14px', textAlign: 'center', marginBottom: '28px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' },
  input: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  group: { marginBottom: '18px' },
  btn: { width: '100%', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' },
  err: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' },
  warn: { background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', marginBottom: '16px', lineHeight: '1.5' },
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [profileMissing, setProfileMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setProfileMissing(false)
    setLoading(true)
    try {
      const profile = await login(email, password)
      const roleRedirects = {
        doctor: '/doctor/dashboard',
        admin: '/doctor/dashboard',
        receptionist: '/receptionist/dashboard',
        clinical_assistant: '/clinical-assistant/dashboard',
      }
      navigate(roleRedirects[profile.role] || '/patient/dashboard')
    } catch (err) {
      if (err.code === 'PROFILE_NOT_FOUND') {
        setProfileMissing(true)
      } else {
        setError(err.message || 'Invalid credentials')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h1 style={S.title}>NeuroWellness</h1>
        <p style={S.sub}>Sign in to your account</p>

        {profileMissing && (
          <div style={S.warn}>
            <strong>Account setup incomplete.</strong><br />
            Your Supabase account exists but your profile was never saved.{' '}
            <Link to="/register">Register again</Link> with your full details to complete setup.
          </div>
        )}
        {error && <div style={S.err}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={S.group}>
            <label style={S.label}>Email</label>
            <input style={S.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>
          <div style={S.group}>
            <label style={S.label}>Password</label>
            <input style={S.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
          </div>
          <button style={S.btn} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#6b7280' }}>
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  )
}
