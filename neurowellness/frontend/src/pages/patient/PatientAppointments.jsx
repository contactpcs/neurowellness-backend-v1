import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PatientLayout from '../../components/layout/PatientLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import { useAppointmentsStore } from '../../store/appointmentsStore'
import { getSocket } from '../../lib/socket'
import { STATUS_COLORS } from '../../components/appointments/AppointmentCalendar'

const S = {
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827' },
  reqBtn: { background: '#0891b2', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  tabs: { display: 'flex', gap: '8px', marginBottom: '16px' },
  tab: (a) => ({ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '600', background: a ? '#4f46e5' : '#e5e7eb', color: a ? '#fff' : '#374151' }),
  card: { background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontWeight: '700', fontSize: '15px', color: '#111827' },
  meta: { fontSize: '13px', color: '#6b7280', marginTop: '3px' },
  badge: (c) => ({ background: c + '20', color: c, borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '700' }),
  actions: { display: 'flex', gap: '8px' },
  btn: (bg) => ({ background: bg, color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 13px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }),
  empty: { color: '#9ca3af', fontSize: '14px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: '#fff', borderRadius: '12px', padding: '24px', width: '460px', maxWidth: '92vw', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', margin: '12px 0 4px' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' },
}

const ACTIVE = ['scheduled', 'confirmed', 'checked_in', 'in_progress']
const hoursUntil = (iso) => (new Date(iso).getTime() - Date.now()) / 36e5
const fmt = (iso) => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const today = () => new Date().toISOString().slice(0, 10)

function RescheduleRequestModal({ appt, onClose, onDone }) {
  const submitRescheduleRequest = useAppointmentsStore(s => s.submitRescheduleRequest)
  const [d1, setD1] = useState(''); const [d2, setD2] = useState(''); const [d3, setD3] = useState('')
  const [tw, setTw] = useState('any'); const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')

  const submit = async () => {
    if (!d1) return setError('Pick at least one preferred date')
    if (reason.trim().length < 5) return setError('Give a reason (min 5 chars)')
    setBusy(true); setError('')
    try {
      await submitRescheduleRequest(appt.appointment_id, {
        preferred_date_1: d1, preferred_date_2: d2 || null, preferred_date_3: d3 || null,
        preferred_time_window: tw, reason: reason.trim(),
      })
      onDone?.(); onClose()
    } catch (e) { setError(e.response?.data?.detail || 'Failed to submit') }
    finally { setBusy(false) }
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '17px', fontWeight: '700', marginBottom: '6px' }}>Request reschedule</div>
        <p style={S.meta}>Current: {fmt(appt.start_at)}</p>
        <label style={S.label}>Preferred dates</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <input style={S.input} type="date" min={today()} value={d1} onChange={e => setD1(e.target.value)} />
          <input style={S.input} type="date" min={today()} value={d2} onChange={e => setD2(e.target.value)} />
          <input style={S.input} type="date" min={today()} value={d3} onChange={e => setD3(e.target.value)} />
        </div>
        <label style={S.label}>Time window</label>
        <select style={S.input} value={tw} onChange={e => setTw(e.target.value)}>
          <option value="any">Any</option><option value="morning">Morning</option>
          <option value="afternoon">Afternoon</option><option value="evening">Evening</option>
        </select>
        <label style={S.label}>Reason</label>
        <textarea style={{ ...S.input, minHeight: '70px' }} rows={3} value={reason} onChange={e => setReason(e.target.value)} />
        {error && <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button style={S.btn('#4f46e5')} disabled={busy} onClick={submit}>Submit request</button>
          <button style={{ ...S.btn('#e5e7eb'), color: '#374151' }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function PatientAppointments() {
  const navigate = useNavigate()
  const { appointments, requests, loading, fetchAppointments, fetchRequests, cancel, cancelRequest,
          applySocketEvent } = useAppointmentsStore()
  const [tab, setTab] = useState('upcoming')
  const [rescheduleAppt, setRescheduleAppt] = useState(null)

  const load = () => { fetchAppointments(); fetchRequests() }
  useEffect(() => { load() }, [])

  useEffect(() => {
    const socket = getSocket()
    const handler = (event, payload) => {
      if (typeof event !== 'string') return
      if (event.startsWith('appointment:')) applySocketEvent(event, payload)
      if (event.startsWith('appointment_request:')) fetchRequests()
    }
    socket.onAny(handler)
    return () => socket.offAny(handler)
  }, [])

  const upcoming = appointments.filter(a => ACTIVE.includes(a.status) && hoursUntil(a.start_at) > -1)
  const past = appointments.filter(a => !ACTIVE.includes(a.status) || hoursUntil(a.start_at) <= -1)

  const doCancel = async (a) => {
    if (!confirm('Cancel this appointment?')) return
    try { await cancel(a.appointment_id, 'Cancelled by patient'); load() }
    catch (e) { alert(e.response?.data?.detail || 'Cancel failed') }
  }

  const renderAppt = (a) => {
    const canCancel = ACTIVE.includes(a.status) && hoursUntil(a.start_at) >= 2
    const canResched = ['scheduled', 'confirmed'].includes(a.status) && hoursUntil(a.start_at) >= 24
    return (
      <div key={a.appointment_id} style={S.card}>
        <div>
          <div style={S.title}>Dr. {a.doctor_name || '—'} <span style={S.badge(STATUS_COLORS[a.status])}>{a.status}</span></div>
          <div style={S.meta}>{fmt(a.start_at)} · {a.appointment_type}</div>
          {a.reason && <div style={S.meta}>{a.reason}</div>}
        </div>
        <div style={S.actions}>
          {canResched && <button style={S.btn('#4f46e5')} onClick={() => setRescheduleAppt(a)}>Reschedule</button>}
          {canCancel && <button style={S.btn('#dc2626')} onClick={() => doCancel(a)}>Cancel</button>}
        </div>
      </div>
    )
  }

  return (
    <PatientLayout>
      <div style={S.head}>
        <h1 style={S.h1}>My Appointments</h1>
        <button style={S.reqBtn} onClick={() => navigate('/patient/appointments/request')}>+ Request Appointment</button>
      </div>

      <div style={S.tabs}>
        <button style={S.tab(tab === 'upcoming')} onClick={() => setTab('upcoming')}>Upcoming</button>
        <button style={S.tab(tab === 'past')} onClick={() => setTab('past')}>Past</button>
        <button style={S.tab(tab === 'requests')} onClick={() => setTab('requests')}>Requests</button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {tab === 'upcoming' && (upcoming.length ? upcoming.map(renderAppt) : <p style={S.empty}>No upcoming appointments.</p>)}
          {tab === 'past' && (past.length ? past.map(renderAppt) : <p style={S.empty}>No past appointments.</p>)}
          {tab === 'requests' && (requests.length ? requests.map(r => (
            <div key={r.request_id} style={S.card}>
              <div>
                <div style={S.title}>
                  Dr. {r.doctor_name || '—'} <span style={S.badge('#6b7280')}>{r.status}</span>
                  {r.request_type === 'reschedule' && <span style={S.badge('#9ca3af')}>reschedule</span>}
                </div>
                <div style={S.meta}>Preferred: {[r.preferred_date_1, r.preferred_date_2, r.preferred_date_3].filter(Boolean).join(', ')} ({r.preferred_time_window})</div>
                {r.review_notes && <div style={S.meta}>Note: {r.review_notes}</div>}
              </div>
              {r.status === 'pending' && (
                <button style={S.btn('#dc2626')} onClick={async () => { await cancelRequest(r.request_id); fetchRequests() }}>Withdraw</button>
              )}
            </div>
          )) : <p style={S.empty}>No requests yet.</p>)}
        </>
      )}

      {rescheduleAppt && (
        <RescheduleRequestModal appt={rescheduleAppt} onClose={() => setRescheduleAppt(null)} onDone={load} />
      )}
    </PatientLayout>
  )
}
