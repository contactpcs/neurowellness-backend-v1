import { useEffect, useState } from 'react'
import DoctorLayout from '../../components/layout/DoctorLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import AppointmentCalendar from '../../components/appointments/AppointmentCalendar'
import AppointmentDetailModal from '../../components/appointments/AppointmentDetailModal'
import RescheduleModal from '../../components/appointments/RescheduleModal'
import { useAppointmentsStore } from '../../store/appointmentsStore'
import { getSocket } from '../../lib/socket'

const S = {
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827' },
}

export default function DoctorAppointments() {
  const { appointments, loading, fetchAppointments, action, cancel, applySocketEvent } = useAppointmentsStore()
  const [selected, setSelected] = useState(null)
  const [rescheduling, setRescheduling] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchAppointments() }, [])

  useEffect(() => {
    const socket = getSocket()
    const handler = (event, payload) => {
      if (typeof event === 'string' && event.startsWith('appointment:')) {
        applySocketEvent(event, payload)
      }
    }
    socket.onAny(handler)
    return () => socket.offAny(handler)
  }, [])

  const refreshSelected = (id) => {
    const fresh = useAppointmentsStore.getState().appointments.find(a => a.appointment_id === id)
    setSelected(fresh || null)
  }

  const doAction = async (name) => {
    if (!selected) return
    setBusy(true)
    try {
      await action(selected.appointment_id, name)
      refreshSelected(selected.appointment_id)
    } catch (e) { alert(e.response?.data?.detail || 'Action failed') }
    finally { setBusy(false) }
  }

  const doCancel = async (reason) => {
    setBusy(true)
    try {
      await cancel(selected.appointment_id, reason)
      setSelected(null)
    } catch (e) { alert(e.response?.data?.detail || 'Cancel failed') }
    finally { setBusy(false) }
  }

  return (
    <DoctorLayout>
      <div style={S.head}>
        <h1 style={S.h1}>My Appointments</h1>
      </div>

      {loading ? <LoadingSpinner /> : (
        <AppointmentCalendar
          appointments={appointments}
          initialView="timeGridWeek"
          editable
          onSelectEvent={setSelected}
          onEventDrop={(appt) => { setSelected(appt); setRescheduling(appt) }}
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
          onDone={() => { setRescheduling(null); setSelected(null); fetchAppointments() }}
        />
      )}
    </DoctorLayout>
  )
}
