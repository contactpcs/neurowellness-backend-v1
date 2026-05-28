import { useEffect, useMemo, useState } from 'react'
import { useAppointmentsStore } from '../../store/appointmentsStore'

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: '#fff', borderRadius: '12px', padding: '24px', width: '600px', maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' },
  title: { fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px', marginTop: '12px' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' },
  list: { maxHeight: '210px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', marginTop: '6px' },
  row: (active) => ({ padding: '8px 12px', cursor: 'pointer', background: active ? '#eef2ff' : '#fff', borderBottom: '1px solid #f3f4f6', fontSize: '14px' }),
  selectedRow: { padding: '10px 12px', borderRadius: '8px', background: '#eef2ff', border: '1px solid #4f46e5', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  meta: { fontSize: '12px', color: '#6b7280' },
  hint: { fontSize: '12px', color: '#4f46e5', marginTop: '4px', fontWeight: '600' },
  slotGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '8px' },
  slot: (active) => ({ padding: '9px', borderRadius: '8px', border: '1px solid ' + (active ? '#4f46e5' : '#d1d5db'), background: active ? '#4f46e5' : '#fff', color: active ? '#fff' : '#374151', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }),
  actions: { display: 'flex', gap: '8px', marginTop: '20px' },
  btn: { background: '#0891b2', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  ghost: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  err: { color: '#dc2626', fontSize: '13px', marginTop: '10px' },
  changeLink: { background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
}

const today = () => new Date().toISOString().slice(0, 10)
const pname = (p) => (p.profiles?.full_name) || p.full_name || p.email || p.id

export default function BookingModal({ onClose, onBooked }) {
  const {
    doctors, slots, slotsLoading,
    patients, patientsLoading,
    fetchClinicDoctors, fetchSlots, fetchPatientsList, book,
  } = useAppointmentsStore()

  const [search, setSearch] = useState('')
  const [patient, setPatient] = useState(null)

  const [doctorId, setDoctorId] = useState('')
  const [date, setDate] = useState(today())
  const [slot, setSlot] = useState(null)
  const [type, setType] = useState('consultation')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Load doctors + patient list on open (cached in store; instant on re-open)
  useEffect(() => {
    fetchClinicDoctors()
    fetchPatientsList()
  }, [])

  // When patient picked, preselect their assigned doctor (receptionist may change it).
  useEffect(() => {
    if (patient?.assigned_doctor_id) setDoctorId(patient.assigned_doctor_id)
  }, [patient])

  // Load slots when doctor + date set
  useEffect(() => {
    setSlot(null)
    if (doctorId && date) fetchSlots(doctorId, date).catch(() => {})
  }, [doctorId, date])

  const filtered = useMemo(() => {
    if (!search.trim()) return patients
    const s = search.toLowerCase()
    return patients.filter(p => {
      const n = pname(p).toLowerCase()
      const e = (p.profiles?.email || '').toLowerCase()
      return n.includes(s) || e.includes(s)
    })
  }, [patients, search])

  const assignedDoctor = useMemo(
    () => patient?.assigned_doctor_id ? doctors.find(d => d.id === patient.assigned_doctor_id) : null,
    [patient, doctors]
  )

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
    } finally { setBusy(false) }
  }

  const available = slots.filter(s => s.is_available)

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.title}>Book Appointment</div>

        {/* Patient picker — always-visible list */}
        <label style={S.label}>Patient</label>
        {patient ? (
          <div style={S.selectedRow}>
            <div>
              <div style={{ fontWeight: '600' }}>{pname(patient)}</div>
              <div style={S.meta}>{patient.profiles?.email}</div>
            </div>
            <button style={S.changeLink} onClick={() => { setPatient(null); setDoctorId('') }}>Change</button>
          </div>
        ) : (
          <>
            <input style={S.input} placeholder="Filter by name or email…" value={search}
                   onChange={e => setSearch(e.target.value)} />
            <div style={S.list}>
              {patientsLoading ? (
                <div style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>Loading patients…</div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: '12px', color: '#9ca3af', fontSize: '14px' }}>
                  No approved patients{search ? ' match the filter' : ' in this clinic'}.
                </div>
              ) : filtered.map(p => (
                <div key={p.id} style={S.row(false)} onClick={() => setPatient(p)}>
                  <div style={{ fontWeight: '600' }}>{pname(p)}</div>
                  <div style={S.meta}>{p.profiles?.email || '—'}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Doctor — auto-preselect patient's assigned doctor */}
        <label style={S.label}>Doctor</label>
        <select style={S.input} value={doctorId} onChange={e => setDoctorId(e.target.value)}>
          <option value="">Select doctor…</option>
          {doctors.map(d => {
            const isAssigned = patient?.assigned_doctor_id === d.id
            return (
              <option key={d.id} value={d.id}>
                {d.full_name}{d.specialization ? ` · ${d.specialization}` : ''}{isAssigned ? '  (assigned)' : ''}
              </option>
            )
          })}
        </select>
        {patient && assignedDoctor && (
          <div style={S.hint}>
            Assigned doctor: {assignedDoctor.full_name}
            {doctorId !== assignedDoctor.id ? ' — you are booking with a different doctor.' : ''}
          </div>
        )}
        {patient && !patient.assigned_doctor_id && (
          <div style={{ ...S.hint, color: '#b45309' }}>
            This patient has no assigned doctor — pick one manually.
          </div>
        )}

        <label style={S.label}>Date</label>
        <input style={S.input} type="date" min={today()} value={date} onChange={e => setDate(e.target.value)} />

        {doctorId && (
          <>
            <label style={S.label}>Available slots</label>
            {slotsLoading ? (
              <p style={{ color: '#6b7280', fontSize: '13px' }}>Loading slots…</p>
            ) : available.length === 0 ? (
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
