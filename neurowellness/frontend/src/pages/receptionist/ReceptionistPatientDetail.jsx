import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../../lib/api'
import StaffLayout from '../../components/layout/StaffLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const S = {
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '4px' },
  sub: { color: '#6b7280', fontSize: '14px', marginBottom: '24px' },
  card: { background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '16px' },
  row: { display: 'flex', gap: '12px', marginBottom: '12px', fontSize: '14px' },
  label: { fontWeight: '600', color: '#374151', width: '140px', flexShrink: 0 },
  value: { color: '#6b7280' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '10px 12px', background: '#f9fafb', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', color: '#374151' },
  select: { border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', outline: 'none', flex: 1 },
  btn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  badge: (color) => ({ display: 'inline-block', background: color + '20', color, borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '600' }),
}

const statusColor = (s) => s === 'in_progress' ? '#059669' : s === 'scheduled' ? '#4f46e5' : '#6b7280'

export default function ReceptionistPatientDetail() {
  const { patientId } = useParams()
  const [data, setData] = useState(null)
  const [doctors, setDoctors] = useState([])
  const [selectedDoctor, setSelectedDoctor] = useState('')
  const [allocating, setAllocating] = useState(false)
  const [allocMsg, setAllocMsg] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get(`/staff/patients/${patientId}`),
      api.get('/doctors/patients?limit=100'),
    ]).then(([r1, r2]) => {
      setData(r1.data.data)
      // Extract distinct doctors from patient list data (only need ids + names)
      const doctorList = (r2.data.data || [])
        .filter(p => p.assigned_doctor_id)
        .map(p => ({ id: p.assigned_doctor_id }))
      setDoctors([])
    }).catch(() => {}).finally(() => setLoading(false))

    // Load doctors separately from profiles
    api.get('/doctors/patients?limit=1').catch(() => {})
  }, [patientId])

  useEffect(() => {
    // Fetch all doctors for the allocate dropdown
    api.get('/staff/patients?limit=1').catch(() => {})
    // We use a simple doctor endpoint — fetch from profiles
    api.get('/staff/dashboard').then(r => {
      // We don't have a /doctors list endpoint; load from patients table doctor fields
    }).catch(() => {})
  }, [])

  const handleAllocate = async () => {
    if (!selectedDoctor) return
    setAllocating(true)
    setAllocMsg('')
    try {
      await api.post(`/staff/patients/${patientId}/allocate`, { doctor_id: selectedDoctor })
      setAllocMsg('Doctor allocated successfully')
      const r = await api.get(`/staff/patients/${patientId}`)
      setData(r.data.data)
      setSelectedDoctor('')
    } catch (e) {
      setAllocMsg(e.response?.data?.detail || 'Allocation failed')
    } finally {
      setAllocating(false)
    }
  }

  if (loading) return <StaffLayout><LoadingSpinner /></StaffLayout>
  if (!data) return <StaffLayout><p>Patient not found</p></StaffLayout>

  const { patient, recent_sessions = [] } = data

  return (
    <StaffLayout>
      <h1 style={S.h1}>{patient.full_name}</h1>
      <p style={S.sub}>{patient.email}</p>

      <div style={S.card}>
        <h2 style={{ fontWeight: '600', marginBottom: '16px', fontSize: '16px' }}>Patient Information</h2>
        {[
          ['Full Name', patient.full_name],
          ['Email', patient.email],
          ['Phone', patient.phone || '—'],
          ['Gender', patient.gender || '—'],
          ['Assigned Doctor', patient.assigned_doctor_id ? `ID: ${patient.assigned_doctor_id?.slice(0, 8)}...` : 'None'],
        ].map(([label, value]) => (
          <div key={label} style={S.row}>
            <span style={S.label}>{label}</span>
            <span style={S.value}>{value}</span>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <h2 style={{ fontWeight: '600', marginBottom: '4px', fontSize: '15px' }}>Allocate Doctor</h2>
        <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '14px' }}>
          Enter a doctor ID to assign this patient to a specific doctor.
        </p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            style={{ ...S.select, flex: 1 }}
            placeholder="Enter Doctor ID (UUID)"
            value={selectedDoctor}
            onChange={e => setSelectedDoctor(e.target.value)}
          />
          <button
            style={{ ...S.btn, opacity: allocating || !selectedDoctor ? 0.6 : 1 }}
            onClick={handleAllocate}
            disabled={allocating || !selectedDoctor}
          >
            {allocating ? 'Allocating...' : 'Allocate'}
          </button>
        </div>
        {allocMsg && (
          <p style={{ marginTop: '10px', fontSize: '13px', color: allocMsg.includes('successfully') ? '#16a34a' : '#dc2626' }}>
            {allocMsg}
          </p>
        )}
      </div>

      <div style={S.card}>
        <h2 style={{ fontWeight: '600', marginBottom: '16px', fontSize: '15px' }}>Recent Sessions</h2>
        {!recent_sessions.length ? (
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>No sessions yet</p>
        ) : (
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Date</th>
              <th style={S.th}>Type</th>
              <th style={S.th}>Status</th>
            </tr></thead>
            <tbody>
              {recent_sessions.map((s, i) => (
                <tr key={i}>
                  <td style={S.td}>{s.session_date ? new Date(s.session_date).toLocaleDateString() : '—'}</td>
                  <td style={S.td}>{s.session_type || '—'}</td>
                  <td style={S.td}>
                    <span style={S.badge(statusColor(s.status))}>{s.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </StaffLayout>
  )
}
