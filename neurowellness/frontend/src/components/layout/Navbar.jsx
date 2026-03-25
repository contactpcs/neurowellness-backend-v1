import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const styles = {
  nav: {
    background: '#4f46e5', color: '#fff', padding: '0 24px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    height: '56px', position: 'sticky', top: 0, zIndex: 100,
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  brand: { fontWeight: '700', fontSize: '18px', color: '#fff', textDecoration: 'none' },
  links: { display: 'flex', gap: '20px', alignItems: 'center' },
  link: { color: '#c7d2fe', fontSize: '14px', textDecoration: 'none', fontWeight: '500' },
  badge: {
    background: '#818cf8', borderRadius: '12px', padding: '2px 8px',
    fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  userName: { fontSize: '14px', fontWeight: '500' },
  logoutBtn: {
    background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
    fontSize: '13px', fontWeight: '500',
  },
}

export default function Navbar() {
  const { profile, role, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <nav style={styles.nav}>
      <Link to="/" style={styles.brand}>NeuroWellness</Link>

      <div style={styles.links}>
        {role === 'doctor' && (
          <>
            <Link to="/doctor/dashboard" style={styles.link}>Dashboard</Link>
            <Link to="/doctor/patients" style={styles.link}>Patients</Link>
          </>
        )}
        {role === 'patient' && (
          <>
            <Link to="/patient/dashboard" style={styles.link}>Dashboard</Link>
            <Link to="/patient/assessments" style={styles.link}>Assessments</Link>
            <Link to="/patient/scores" style={styles.link}>My Scores</Link>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={styles.badge}>{role}</span>
        <span style={styles.userName}>{profile?.full_name || profile?.email}</span>
        <button style={styles.logoutBtn} onClick={handleLogout}>Logout</button>
      </div>
    </nav>
  )
}
