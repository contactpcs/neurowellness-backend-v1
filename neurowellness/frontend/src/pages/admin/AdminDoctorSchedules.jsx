import { useEffect, useState } from 'react'
import AdminLayout from '../../components/layout/AdminLayout'
import WeeklyScheduleEditor from '../../components/appointments/WeeklyScheduleEditor'
import api from '../../lib/api'

const S = {
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '16px' },
  card: { background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' },
  select: { width: '100%', maxWidth: '420px', padding: '9px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' },
}

export default function AdminDoctorSchedules() {
  const [doctors, setDoctors] = useState([])
  const [doctorId, setDoctorId] = useState('')

  useEffect(() => {
    api.get('/schedule/clinic/doctors')
      .then(r => setDoctors(r.data.data || []))
      .catch(() => {})
  }, [])

  return (
    <AdminLayout>
      <h1 style={S.h1}>Doctor Schedules</h1>
      <div style={S.card}>
        <label style={S.label}>Select doctor</label>
        <select style={S.select} value={doctorId} onChange={e => setDoctorId(e.target.value)}>
          <option value="">Choose a doctor…</option>
          {doctors.map(d => (
            <option key={d.id} value={d.id}>
              {d.full_name}{d.specialization ? ` · ${d.specialization}` : ''}
            </option>
          ))}
        </select>
      </div>

      {doctorId && (
        <WeeklyScheduleEditor
          doctorId={doctorId}
          title={`Weekly hours · ${doctors.find(d => d.id === doctorId)?.full_name || ''}`}
        />
      )}
    </AdminLayout>
  )
}
