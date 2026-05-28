import { useEffect, useState } from 'react'
import StaffLayoutDefault from '../../components/layout/StaffLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import RequestReviewPanel from '../../components/appointments/RequestReviewPanel'
import { useAppointmentsStore } from '../../store/appointmentsStore'
import { getSocket } from '../../lib/socket'

const S = {
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '16px' },
  card: { background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontWeight: '700', fontSize: '15px', color: '#111827' },
  meta: { fontSize: '13px', color: '#6b7280', marginTop: '3px' },
  badge: (c) => ({ background: c + '20', color: c, borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '700', marginLeft: '8px' }),
  btn: { background: '#0891b2', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  empty: { color: '#9ca3af', fontSize: '14px' },
}

const urgencyColor = (u) => u === 'emergency' ? '#dc2626' : u === 'urgent' ? '#b45309' : '#0891b2'

export default function AppointmentRequests({ Layout = StaffLayoutDefault }) {
  const { requests, loading, fetchRequests, applyRequestSocketEvent } = useAppointmentsStore()
  const [reviewing, setReviewing] = useState(null)

  useEffect(() => { fetchRequests('pending') }, [])

  useEffect(() => {
    const socket = getSocket()
    const handler = (event, payload) => {
      if (typeof event === 'string' && event.startsWith('appointment_request:')) {
        applyRequestSocketEvent(event, payload)
      }
    }
    socket.onAny(handler)
    return () => socket.offAny(handler)
  }, [])

  return (
    <Layout>
      <h1 style={S.h1}>Appointment Requests {requests.length > 0 && <span style={S.badge('#dc2626')}>{requests.length} pending</span>}</h1>

      {loading ? <LoadingSpinner /> : requests.length === 0 ? (
        <p style={S.empty}>No pending requests.</p>
      ) : (
        requests.map(r => (
          <div key={r.request_id} style={S.card}>
            <div>
              <div style={S.name}>
                {r.patient_name || 'Patient'}
                {r.request_type === 'reschedule' && <span style={S.badge('#9ca3af')}>reschedule</span>}
                <span style={S.badge(urgencyColor(r.urgency))}>{r.urgency}</span>
              </div>
              <div style={S.meta}>Dr. {r.doctor_name || '—'} · {r.patient_complaint?.slice(0, 80)}</div>
              <div style={S.meta}>
                Preferred: {[r.preferred_date_1, r.preferred_date_2, r.preferred_date_3].filter(Boolean).join(', ')} ({r.preferred_time_window})
              </div>
            </div>
            <button style={S.btn} onClick={() => setReviewing(r)}>Review</button>
          </div>
        ))
      )}

      {reviewing && (
        <RequestReviewPanel
          request={reviewing}
          onClose={() => setReviewing(null)}
          onResolved={() => fetchRequests('pending')}
        />
      )}
    </Layout>
  )
}
