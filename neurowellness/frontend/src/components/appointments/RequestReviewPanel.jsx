import { useEffect, useState } from 'react'
import { useAppointmentsStore } from '../../store/appointmentsStore'

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: '#fff', borderRadius: '12px', padding: '24px', width: '720px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' },
  title: { fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '16px' },
  cols: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  card: { background: '#f9fafb', borderRadius: '10px', padding: '16px' },
  h3: { fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '10px' },
  row: { fontSize: '13px', marginBottom: '8px' },
  label: { color: '#6b7280', fontWeight: '600' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' },
  slotGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' },
  slot: (a) => ({ padding: '8px', borderRadius: '8px', border: '1px solid ' + (a ? '#4f46e5' : '#d1d5db'), background: a ? '#4f46e5' : '#fff', color: a ? '#fff' : '#374151', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }),
  actions: { display: 'flex', gap: '8px', marginTop: '16px' },
  btn: (bg) => ({ background: bg, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }),
  ghost: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '9px 16px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  badge: (c) => ({ background: c + '20', color: c, borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '700' }),
  err: { color: '#dc2626', fontSize: '13px', marginTop: '10px' },
}

const urgencyColor = (u) => u === 'emergency' ? '#dc2626' : u === 'urgent' ? '#b45309' : '#0891b2'

export default function RequestReviewPanel({ request, onClose, onResolved }) {
  const { slots, fetchSlots, approveRequest, rejectRequest } = useAppointmentsStore()
  const dates = [request.preferred_date_1, request.preferred_date_2, request.preferred_date_3].filter(Boolean)
  const [date, setDate] = useState(dates[0] || '')
  const [slot, setSlot] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSlot(null)
    if (date) fetchSlots(request.doctor_id, date).catch(() => {})
  }, [date])

  const available = slots.filter(s => s.is_available)

  const approve = async () => {
    if (!slot) return setError('Pick a slot to approve')
    setBusy(true); setError('')
    try {
      await approveRequest(request.request_id, { appointment_date: date, start_time: slot.start_time })
      onResolved?.()
      onClose()
    } catch (e) { setError(e.response?.data?.detail || 'Approve failed') }
    finally { setBusy(false) }
  }

  const reject = async () => {
    setBusy(true); setError('')
    try {
      await rejectRequest(request.request_id, reason.trim())
      onResolved?.()
      onClose()
    } catch (e) { setError(e.response?.data?.detail || 'Reject failed') }
    finally { setBusy(false) }
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.title}>
          Review Request — {request.patient_name || 'Patient'}{' '}
          {request.request_type === 'reschedule' && <span style={S.badge('#9ca3af')}>reschedule</span>}
        </div>

        <div style={S.cols}>
          <div style={S.card}>
            <div style={S.h3}>Patient</div>
            <div style={S.row}><span style={S.label}>Name: </span>{request.patient_name || '—'}</div>
            <div style={S.row}><span style={S.label}>Doctor: </span>{request.doctor_name || '—'}</div>
            <div style={S.row}><span style={S.label}>Urgency: </span><span style={S.badge(urgencyColor(request.urgency))}>{request.urgency}</span></div>
            <div style={S.row}><span style={S.label}>Complaint: </span>{request.patient_complaint}</div>
            {request.reason && <div style={S.row}><span style={S.label}>Reason: </span>{request.reason}</div>}
            <div style={S.row}><span style={S.label}>Preferred: </span>{dates.join(', ') || '—'} ({request.preferred_time_window})</div>
            <div style={S.row}><span style={S.label}>Submitted: </span>{new Date(request.created_at).toLocaleString()}</div>
          </div>

          <div style={S.card}>
            <div style={S.h3}>Assign a slot</div>
            <select style={S.input} value={date} onChange={e => setDate(e.target.value)}>
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
              <option value="__custom">Custom date…</option>
            </select>
            {date === '__custom' && (
              <input style={{ ...S.input, marginTop: '8px' }} type="date"
                     onChange={e => setDate(e.target.value)} />
            )}
            <div style={{ marginTop: '10px' }}>
              {available.length === 0
                ? <p style={{ color: '#9ca3af', fontSize: '13px' }}>No available slots on this date.</p>
                : <div style={S.slotGrid}>
                    {available.map(s => (
                      <button key={s.start_time} type="button" style={S.slot(slot?.start_time === s.start_time)}
                              onClick={() => setSlot(s)}>{s.start_time.slice(0, 5)}</button>
                    ))}
                  </div>}
            </div>
          </div>
        </div>

        {error && <div style={S.err}>{error}</div>}

        {!rejecting ? (
          <div style={S.actions}>
            <button style={S.btn('#059669')} disabled={busy || !slot} onClick={approve}>Approve &amp; assign slot</button>
            <button style={S.btn('#dc2626')} disabled={busy} onClick={() => setRejecting(true)}>Reject…</button>
            <button style={S.ghost} onClick={onClose}>Close</button>
          </div>
        ) : (
          <div style={{ marginTop: '14px' }}>
            <textarea style={{ ...S.input, minHeight: '70px' }} rows={3}
                      placeholder="Reason for rejection (shown to patient, min 5 chars)"
                      value={reason} onChange={e => setReason(e.target.value)} />
            <div style={S.actions}>
              <button style={S.btn('#dc2626')} disabled={busy || reason.trim().length < 5} onClick={reject}>Confirm reject</button>
              <button style={S.ghost} onClick={() => setRejecting(false)}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
