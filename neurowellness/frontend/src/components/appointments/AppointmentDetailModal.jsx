import { useState } from 'react'
import { STATUS_COLORS } from './AppointmentCalendar'

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: '#fff', borderRadius: '12px', padding: '24px', width: '460px', maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' },
  title: { fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '4px' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6', fontSize: '14px' },
  label: { color: '#6b7280' },
  badge: (c) => ({ background: (c || '#4f46e5') + '20', color: c || '#4f46e5', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: '700' }),
  actions: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '18px' },
  btn: (bg) => ({ background: bg, color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }),
  ghost: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
}

const fmt = (iso) => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export default function AppointmentDetailModal({ appt, onClose, onAction, onCancel, onReschedule, busy }) {
  const [reason, setReason] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  if (!appt) return null

  const st = appt.status
  const can = {
    confirm: st === 'scheduled',
    checkin: st === 'scheduled' || st === 'confirmed',
    start: st === 'checked_in',
    complete: st === 'in_progress',
    noshow: st === 'scheduled' || st === 'confirmed' || st === 'checked_in',
    reschedule: st === 'scheduled' || st === 'confirmed',
    cancel: st === 'scheduled' || st === 'confirmed' || st === 'checked_in',
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.title}>{appt.patient_name || 'Patient'}</div>
        <span style={S.badge(STATUS_COLORS[st])}>{st}</span>

        <div style={{ marginTop: '14px' }}>
          <div style={S.row}><span style={S.label}>Doctor</span><span>{appt.doctor_name || '—'}</span></div>
          <div style={S.row}><span style={S.label}>Date</span><span>{appt.appointment_date}</span></div>
          <div style={S.row}><span style={S.label}>Time</span><span>{fmt(appt.start_at)}</span></div>
          <div style={S.row}><span style={S.label}>Type</span><span>{appt.appointment_type}</span></div>
          {appt.reason && <div style={S.row}><span style={S.label}>Reason</span><span>{appt.reason}</span></div>}
          {appt.patient_complaint && <div style={S.row}><span style={S.label}>Complaint</span><span>{appt.patient_complaint}</span></div>}
          {appt.notes && <div style={S.row}><span style={S.label}>Notes</span><span>{appt.notes}</span></div>}
        </div>

        {!showCancel ? (
          <div style={S.actions}>
            {can.confirm && <button style={S.btn('#0891b2')} disabled={busy} onClick={() => onAction('confirm')}>Confirm</button>}
            {can.checkin && <button style={S.btn('#7c3aed')} disabled={busy} onClick={() => onAction('check-in')}>Check in</button>}
            {can.start && <button style={S.btn('#059669')} disabled={busy} onClick={() => onAction('start')}>Start</button>}
            {can.complete && <button style={S.btn('#059669')} disabled={busy} onClick={() => onAction('complete')}>Complete</button>}
            {can.reschedule && <button style={S.btn('#4f46e5')} disabled={busy} onClick={onReschedule}>Reschedule</button>}
            {can.noshow && <button style={S.btn('#b45309')} disabled={busy} onClick={() => onAction('no-show')}>No-show</button>}
            {can.cancel && <button style={S.btn('#dc2626')} disabled={busy} onClick={() => setShowCancel(true)}>Cancel</button>}
            <button style={S.ghost} onClick={onClose}>Close</button>
          </div>
        ) : (
          <div style={{ marginTop: '16px' }}>
            <textarea
              placeholder="Cancellation reason (min 3 chars)"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
            />
            <div style={S.actions}>
              <button style={S.btn('#dc2626')} disabled={busy || reason.trim().length < 3}
                      onClick={() => onCancel(reason.trim())}>Confirm cancellation</button>
              <button style={S.ghost} onClick={() => setShowCancel(false)}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
