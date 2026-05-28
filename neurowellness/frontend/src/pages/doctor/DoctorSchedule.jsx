import DoctorLayout from '../../components/layout/DoctorLayout'
import WeeklyScheduleEditor from '../../components/appointments/WeeklyScheduleEditor'

export default function DoctorSchedule() {
  return (
    <DoctorLayout>
      <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>
        My Schedule
      </h1>
      <WeeklyScheduleEditor title="Weekly working hours" />
    </DoctorLayout>
  )
}
