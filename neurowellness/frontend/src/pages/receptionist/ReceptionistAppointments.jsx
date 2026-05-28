import { useEffect, useState } from 'react'
import StaffLayoutDefault from '../../components/layout/StaffLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import AppointmentCalendar from '../../components/appointments/AppointmentCalendar'
import AppointmentDetailModal from '../../components/appointments/AppointmentDetailModal'
import BookingModal from '../../components/appointments/BookingModal'
import RescheduleModal from '../../components/appointments/RescheduleModal'
import { useAppointmentsStore } from '../../store/appointmentsStore'
import { getSocket } from '../../lib/socket'

const S = {
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' },
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827' },
  controls: { display: 'flex', gap: '10px', alignItems: 'center' },
  select: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' },
  bookBtn: { background: '#0891b2', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
}

export default function ReceptionistAppointments({ Layout = StaffLayoutDefault }) {
  const {
    appointments, loading, doctors,
    fetchAppointments, fetchClinicDoctors, action, cancel, applySocketEvent,
  } = useAppointmentsStore()

  const [doctorFilter, setDoctorFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [rescheduling, setRescheduling] = useState(null)
  const [booking, setBooking] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchClinicDoctors() }, [])
  useEffect(() => {
    fetchAppointments(doctorFilter ? { doctor_id: doctorFilter } : {})
  }, [doctorFilter])

  useEffect(() => {
    const socket = getSocket()
    const handler = (event, payload) => {
      if (typeof event === 'string' && event.startsWith('appointment:')) applySocketEvent(event, payload)
    }
    socket.onAny(handler)
    return () => socket.offAny(handler)
  }, [])

  const refreshSelected = (id) =>
    setSelected(useAppointmentsStore.getState().appointments.find(a => a.appointment_id === id) || null)

  const doAction = async (name) => {
    setBusy(true)
    try { await action(selected.appointment_id, name); refreshSelected(selected.appointment_id) }
    catch (e) { alert(e.response?.data?.detail || 'Action failed') }
    finally { setBusy(false) }
  }

  const doCancel = async (reason) => {
    setBusy(true)
    try { await cancel(selected.appointment_id, reason); setSelected(null) }
    catch (e) { alert(e.response?.data?.detail || 'Cancel failed') }
    finally { setBusy(false) }
  }

  return (
    <Layout>
      <div style={S.head}>
        <h1 style={S.h1}>Appointments</h1>
        <div style={S.controls}>
          <select style={S.select} value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)}>
            <option value="">All doctors</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
          <button style={S.bookBtn} onClick={() => setBooking(true)}>+ Book Appointment</button>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <AppointmentCalendar
          appointments={appointments}
          initialView="dayGridMonth"
          onSelectEvent={setSelected}
        />
      )}

      {booking && (
        <BookingModal
          onClose={() => setBooking(false)}
          onBooked={() => fetchAppointments(doctorFilter ? { doctor_id: doctorFilter } : {})}
        />
      )}

      {selected && !rescheduling && (
        <AppointmentDetailModal
          appt={selected}
          busy={busy}
          onClose={() => setSelected(null)}
          onAction={doAction}
          onCancel={doCancel}
          onReschedule={() => setRescheduling(selected)}
        />
      )}

      {rescheduling && (
        <RescheduleModal
          appt={rescheduling}
          onClose={() => setRescheduling(null)}
          onDone={() => { setRescheduling(null); setSelected(null); fetchAppointments(doctorFilter ? { doctor_id: doctorFilter } : {}) }}
        />
      )}
    </Layout>
  )
}
