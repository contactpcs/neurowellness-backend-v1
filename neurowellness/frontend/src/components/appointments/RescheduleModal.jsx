import { useEffect, useState } from 'react'
import { useAppointmentsStore } from '../../store/appointmentsStore'

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 210 },
  modal: { background: '#fff', borderRadius: '12px', padding: '24px', width: '480px', maxWidth: '92vw', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', marginBottom: '12px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', margin: '12px 0 4px' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' },
  slotGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '8px' },
  slot: (a) => ({ padding: '8px', borderRadius: '8px', border: '1px solid ' + (a ? '#4f46e5' : '#d1d5db'), background: a ? '#4f46e5' : '#fff', color: a ? '#fff' : '#374151', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }),
  actions: { display: 'flex', gap: '8px', marginTop: '18px' },
  btn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  ghost: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  err: { color: '#dc2626', fontSize: '13px', marginTop: '10px' },
}

const today = () => new Date().toISOString().slice(0, 10)

export default function RescheduleModal({ appt, onClose, onDone }) {
  const { slots, slotsLoading, fetchSlots, reschedule } = useAppointmentsStore()
  const [date, setDate] = useState(appt.appointment_date || today())
  const [slot, setSlot] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSlot(null)
    fetchSlots(appt.doctor_id, date).catch(() => {})
  }, [date])

  const available = slots.filter(s => s.is_available)

  const submit = async () => {
    if (!slot) return setError('Pick a new slot')
    setBusy(true); setError('')
    try {
      const newAppt = await reschedule(appt.appointment_id, { appointment_date: date, start_time: slot.start_time })
      onDone?.(newAppt)
      onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Reschedule failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.title}>Reschedule — {appt.patient_name || 'Patient'}</div>
        <label style={S.label}>New date</label>
        <input style={S.input} type="date" min={today()} value={date} onChange={e => setDate(e.target.value)} />
        <label style={S.label}>New slot</label>
        {slotsLoading
          ? <p style={{ color: '#6b7280', fontSize: '13px' }}>Loading slots…</p>
          : available.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: '13px' }}>No available slots on this date.</p>
          : <div style={S.slotGrid}>
              {available.map(s => (
                <button key={s.start_time} type="button" style={S.slot(slot?.start_time === s.start_time)}
                        onClick={() => setSlot(s)}>{s.start_time.slice(0, 5)}</button>
              ))}
            </div>}
        {error && <div style={S.err}>{error}</div>}
        <div style={S.actions}>
          <button style={S.btn} disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Confirm reschedule'}</button>
          <button style={S.ghost} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
