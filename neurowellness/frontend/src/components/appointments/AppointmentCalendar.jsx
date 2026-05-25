import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'

export const STATUS_COLORS = {
  scheduled:   '#4f46e5',
  confirmed:   '#0891b2',
  checked_in:  '#7c3aed',
  in_progress: '#059669',
  completed:   '#6b7280',
  cancelled:   '#dc2626',
  no_show:     '#b45309',
  rescheduled: '#9ca3af',
}

function toEvent(a) {
  const color = STATUS_COLORS[a.status] || '#4f46e5'
  const who = a.patient_name || a.doctor_name || 'Appointment'
  return {
    id: a.appointment_id,
    title: `${who} · ${a.status}`,
    start: a.start_at,
    end: a.end_at,
    backgroundColor: color,
    borderColor: color,
    editable: a.status === 'scheduled' || a.status === 'confirmed',
    extendedProps: { appt: a },
  }
}

export default function AppointmentCalendar({
  appointments = [],
  initialView = 'timeGridWeek',
  editable = false,
  onSelectEvent,
  onDateClick,
  onEventDrop,
}) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
        initialView={initialView}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
        }}
        height="auto"
        nowIndicator
        slotMinTime="07:00:00"
        slotMaxTime="21:00:00"
        events={appointments.map(toEvent)}
        editable={editable}
        eventClick={(info) => {
          info.jsEvent.preventDefault()
          onSelectEvent?.(info.event.extendedProps.appt)
        }}
        dateClick={(info) => onDateClick?.(info)}
        eventDrop={(info) => {
          if (!onEventDrop) { info.revert(); return }
          onEventDrop(info.event.extendedProps.appt, info.event.start, info.revert)
        }}
      />
    </div>
  )
}
