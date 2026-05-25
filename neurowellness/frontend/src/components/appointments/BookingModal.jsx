import { useEffect, useState } from 'react'
import api from '../../lib/api'
import { useAppointmentsStore } from '../../store/appointmentsStore'

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: '#fff', borderRadius: '12px', padding: '24px', width: '560px', maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' },
  title: { fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px', marginTop: '12px' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' },
  slotGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '8px' },
  slot: (active) => ({ padding: '8px', borderRadius: '8px', border: '1px solid ' + (active ? '#4f46e5' : '#d1d5db'), background: active ? '#4f46e5' : '#fff', color: active ? '#fff' : '#374151', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }),
  actions: { display: 'flex', gap: '8px', marginTop: '20px' },
  btn: { background: '#0891b2', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  ghost: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  err: { color: '#dc2626', fontSize: '13px', marginTop: '10px' },
  patientRow: (active) => ({ padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', background: active ? '#eef2ff' : '#f9fafb', border: '1px solid ' + (active ? '#4f46e5' : '#eef2ff'), marginBottom: '4px', fontSize: '14px' }),
}

const today = () => new Date().toISOString().slice(0, 10)

export default function BookingModal({ onClose, onBooked }) {
  const { doctors, slots, fetchClinicDoctors, fetchSlots, book } = useAppointmentsStore()

  const [search, setSearch] = useState('')
  const [patients, setPatients] = useState([])
  const [patient, setPatient] = useState(null)
  const [doctorId, setDoctorId] = useState('')
  const [date, setDate] = useState(today())
  const [slot, setSlot] = useState(null)
  const [type, setType] = useState('consultation')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchClinicDoctors() }, [])

  // Patient search (debounced-ish)
  useEffect(() => {
    if (search.trim().length < 2) { setPatients([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/staff/patients', { params: { search, limit: 10 } })
        setPatients(res.data.data || [])
      } catch { /* ignore */ }
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Load slots when doctor + date set
  useEffect(() => {
    setSlot(null)
    if (doctorId && date) fetchSlots(doctorId, date).catch(() => {})
  }, [doctorId, date])

  const pname = (p) => (p.profiles?.full_name) || p.full_name || p.email || p.id

  const submit = async () => {
    setError('')
    if (!patient) return setError('Select a patient')
    if (!doctorId) return setError('Select a doctor')
    if (!slot) return setError('Select a time slot')
    setBusy(true)
    try {
      const appt = await book({
        patient_id: patient.id,
        doctor_id: doctorId,
        appointment_date: date,
        start_time: slot.start_time,
        appointment_type: type,
        reason: reason || null,
      })
      onBooked?.(appt)
      onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Booking failed')
    } finally {
      setBusy(false)
    }
  }

  const available = slots.filter(s => s.is_available)

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.title}>Book Appointment</div>

        <label style={S.label}>Patient</label>
        {patient ? (
          <div style={S.patientRow(true)} onClick={() => setPatient(null)}>
            {pname(patient)} <span style={{ color: '#6b7280' }}>· tap to change</span>
          </div>
        ) : (
          <>
            <input style={S.input} placeholder="Search patient by name…" value={search}
                   onChange={e => setSearch(e.target.value)} />
            <div style={{ marginTop: '6px', maxHeight: '160px', overflowY: 'auto' }}>
              {patients.map(p => (
                <div key={p.id} style={S.patientRow(false)} onClick={() => { setPatient(p); setPatients([]); setSearch('') }}>
                  {pname(p)}
                </div>
              ))}
            </div>
          </>
        )}

        <label style={S.label}>Doctor</label>
        <select style={S.input} value={doctorId} onChange={e => setDoctorId(e.target.value)}>
          <option value="">Select doctor…</option>
          {doctors.map(d => (
            <option key={d.id} value={d.id}>
              {d.full_name}{d.specialization ? ` · ${d.specialization}` : ''}
            </option>
          ))}
        </select>

        <label style={S.label}>Date</label>
        <input style={S.input} type="date" min={today()} value={date} onChange={e => setDate(e.target.value)} />

        {doctorId && (
          <>
            <label style={S.label}>Available slots</label>
            {available.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '13px' }}>No available slots on this date.</p>
            ) : (
              <div style={S.slotGrid}>
                {available.map(s => (
                  <button key={s.start_time} type="button"
                          style={S.slot(slot?.start_time === s.start_time)}
                          onClick={() => setSlot(s)}>
                    {s.start_time.slice(0, 5)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <label style={S.label}>Type</label>
        <select style={S.input} value={type} onChange={e => setType(e.target.value)}>
          <option value="consultation">Consultation</option>
          <option value="follow_up">Follow-up</option>
          <option value="assessment">Assessment</option>
          <option value="emergency">Emergency</option>
        </select>

        <label style={S.label}>Reason (optional)</label>
        <input style={S.input} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for visit" />

        {error && <div style={S.err}>{error}</div>}

        <div style={S.actions}>
          <button style={S.btn} disabled={busy} onClick={submit}>{busy ? 'Booking…' : 'Book appointment'}</button>
          <button style={S.ghost} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
