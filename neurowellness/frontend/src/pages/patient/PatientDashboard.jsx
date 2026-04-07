import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import PatientLayout from '../../components/layout/PatientLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const SEVERITY_COLORS = { minimal: '#16a34a', mild: '#ca8a04', moderate: '#ea580c', severe: '#dc2626' }
const sevColor = (l) => SEVERITY_COLORS[l?.toLowerCase()] || '#6b7280'

const S = {
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '20px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' },
  card: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  cardTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginBottom: '14px' },
  badge: (color) => ({ display: 'inline-block', background: color + '20', color, borderRadius: '20px', padding: '3px 12px', fontWeight: '700', fontSize: '13px' }),
  takeBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
}

export default function PatientDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/patients/dashboard')
      .then(r => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PatientLayout><LoadingSpinner /></PatientLayout>
  if (!data) return <PatientLayout><p>Failed to load dashboard</p></PatientLayout>

  const { profile, assigned_doctor, pending_assessments, recent_scores } = data

  return (
    <PatientLayout>
      <h1 style={S.h1}>Welcome, {profile?.full_name}</h1>

      <div style={S.grid}>
        {/* Doctor Card */}
        <div style={S.card}>
          <div style={S.cardTitle}>My Doctor</div>
          {!assigned_doctor ? (
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>No doctor assigned yet</p>
          ) : (
            <>
              <p style={{ fontWeight: '600', fontSize: '15px', marginBottom: '4px' }}>{assigned_doctor.full_name}</p>
              <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '4px' }}>{assigned_doctor.specialization}</p>
              <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '8px' }}>{assigned_doctor.email}</p>
              <span style={S.badge(assigned_doctor.availability === 'available' ? '#16a34a' : '#ca8a04')}>
                {assigned_doctor.availability}
              </span>
            </>
          )}
        </div>

        {/* Stats */}
        <div style={S.card}>
          <div style={S.cardTitle}>My Summary</div>
          <div style={{ display: 'flex', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#4f46e5' }}>{pending_assessments?.length || 0}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Pending</div>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#059669' }}>{recent_scores?.length || 0}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Recent Scores</div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Assessments */}
      <div style={S.card}>
        <div style={{ ...S.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Pending Assessments</span>
          <Link to="/patient/assessments" style={{ fontSize: '13px', color: '#4f46e5', fontWeight: '500' }}>View All</Link>
        </div>
        {!pending_assessments?.length ? (
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>No pending assessments</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pending_assessments.slice(0, 3).map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>{p.prs_scales?.name}</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>{p.prs_scales?.description?.slice(0, 60)}...</div>
                </div>
                <button style={S.takeBtn} onClick={() => navigate(`/assessment?scale_id=${p.scale_id}`)}>
                  Take
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Scores */}
      {recent_scores?.length > 0 && (
        <div style={{ ...S.card, marginTop: '20px' }}>
          <div style={{ ...S.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Recent Scores</span>
            <Link to="/patient/scores" style={{ fontSize: '13px', color: '#4f46e5', fontWeight: '500' }}>View All</Link>
          </div>
          {recent_scores.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>{new Date(s.time_stamp).toLocaleDateString()}</div>
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>{s.time_stamp ? new Date(s.time_stamp).toLocaleTimeString() : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: '700', fontSize: '16px' }}>{s.calculated_value}<span style={{ fontSize: '12px', color: '#9ca3af' }}>/{s.max_possible}</span></div>
                {s.overall_severity_label && <span style={S.badge(sevColor(s.overall_severity))}>{s.overall_severity_label}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </PatientLayout>
  )
}
