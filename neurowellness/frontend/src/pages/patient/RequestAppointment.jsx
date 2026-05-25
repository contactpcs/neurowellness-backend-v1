import { useNavigate } from 'react-router-dom'
import PatientLayout from '../../components/layout/PatientLayout'
import PatientRequestForm from '../../components/appointments/PatientRequestForm'

export default function RequestAppointment() {
  const navigate = useNavigate()
  return (
    <PatientLayout>
      <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>
        Request an Appointment
      </h1>
      <PatientRequestForm onSubmitted={() => setTimeout(() => navigate('/patient/appointments'), 1200)} />
    </PatientLayout>
  )
}
