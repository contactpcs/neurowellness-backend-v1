import { useState } from 'react'
import { useAppointmentsStore } from '../../store/appointmentsStore'

const S = {
  card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '620px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', margin: '14px 0 4px' },
  input: { width: '100%', padding: '9px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' },
  btn: { background: '#0891b2', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', marginTop: '18px' },
  err: { color: '#dc2626', fontSize: '13px', marginTop: '10px' },
  ok: { color: '#059669', fontSize: '14px', marginTop: '12px', fontWeight: '600' },
  hint: { fontSize: '12px', color: '#6b7280', marginTop: '12px' },
}

const today = () => new Date().toISOString().slice(0, 10)
const maxDate = () => new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10)

export default function PatientRequestForm({ onSubmitted }) {
  const submitRequest = useAppointmentsStore(s => s.submitRequest)
  const [f, setF] = useState({
    preferred_date_1: '', preferred_date_2: '', preferred_date_3: '',
    preferred_time_window: 'any', patient_complaint: '', urgency: 'normal', reason: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }))

  const submit = async () => {
    setError('')
    if (!f.preferred_date_1) return setError('Pick at least one preferred date')
    if (f.patient_complaint.trim().length < 5) return setError('Describe your concern (at least 5 characters)')
    setBusy(true)
    try {
      const payload = {
        preferred_date_1: f.preferred_date_1,
        preferred_date_2: f.preferred_date_2 || null,
        preferred_date_3: f.preferred_date_3 || null,
        preferred_time_window: f.preferred_time_window,
        patient_complaint: f.patient_complaint.trim(),
        urgency: f.urgency,
        reason: f.reason || null,
      }
      await submitRequest(payload)
      setDone(true)
      onSubmitted?.()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to submit request')
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div style={S.card}>
        <div style={S.ok}>Your appointment request has been submitted.</div>
        <p style={S.hint}>The reception team will review it and confirm a time slot with your doctor. You'll be notified once it's confirmed.</p>
      </div>
    )
  }

  return (
    <div style={S.card}>
      <label style={S.label}>Preferred dates</label>
      <div style={S.grid3}>
        <input style={S.input} type="date" min={today()} max={maxDate()} value={f.preferred_date_1} onChange={set('preferred_date_1')} />
        <input style={S.input} type="date" min={today()} max={maxDate()} value={f.preferred_date_2} onChange={set('preferred_date_2')} />
        <input style={S.input} type="date" min={today()} max={maxDate()} value={f.preferred_date_3} onChange={set('preferred_date_3')} />
      </div>

      <label style={S.label}>Preferred time window</label>
      <select style={S.input} value={f.preferred_time_window} onChange={set('preferred_time_window')}>
        <option value="any">Any time</option>
        <option value="morning">Morning (8am–12pm)</option>
        <option value="afternoon">Afternoon (12pm–5pm)</option>
        <option value="evening">Evening (5pm–9pm)</option>
      </select>

      <label style={S.label}>Reason / complaint (visible to your doctor)</label>
      <textarea style={{ ...S.input, minHeight: '90px' }} rows={4} value={f.patient_complaint} onChange={set('patient_complaint')} />

      <label style={S.label}>Urgency</label>
      <select style={S.input} value={f.urgency} onChange={set('urgency')}>
        <option value="normal">Normal</option>
        <option value="urgent">Urgent</option>
        <option value="emergency">Emergency</option>
      </select>

      {error && <div style={S.err}>{error}</div>}

      <button style={S.btn} disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit request'}</button>
      <p style={S.hint}>The reception team will review your request and confirm a time slot with your doctor.</p>
    </div>
  )
}
