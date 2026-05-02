import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/common/ProtectedRoute'
import LoadingSpinner from './components/common/LoadingSpinner'

import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'

// Doctor pages
import DoctorDashboard from './pages/doctor/DoctorDashboard'
import PatientList from './pages/doctor/PatientList'
import PatientDetail from './pages/doctor/PatientDetail'
import DoctorRegisterPatient from './pages/doctor/RegisterPatient'

// Patient pages
import PatientDashboard from './pages/patient/PatientDashboard'
import MyAssessments from './pages/patient/MyAssessments'
import MyScores from './pages/patient/MyScores'
import ScoreDetailPage from './pages/patient/ScoreDetailPage'

// PRS / assessment pages
import AssessmentPage from './pages/prs/AssessmentPage'
import ScoreInstanceDetail from './pages/prs/ScoreInstanceDetail'

// Anamnesis
import AnamnesisPage from './pages/anamnesis/AnamnesisPage'

// Receptionist pages
import ReceptionistDashboard from './pages/receptionist/ReceptionistDashboard'
import ReceptionistPatientList from './pages/receptionist/ReceptionistPatientList'
import ReceptionistPatientDetail from './pages/receptionist/ReceptionistPatientDetail'
import ReceptionistRegisterPatient from './pages/receptionist/RegisterPatient'

// Clinical Assistant pages
import ClinicalAssistantDashboard from './pages/clinical_assistant/ClinicalAssistantDashboard'
import ClinicalAssistantPatientList from './pages/clinical_assistant/ClinicalAssistantPatientList'
import ClinicalAssistantPatientDetail from './pages/clinical_assistant/ClinicalAssistantPatientDetail'

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminClinicList from './pages/admin/AdminClinicList'
import AdminStaffList from './pages/admin/AdminStaffList'
import AdminStaffRegister from './pages/admin/AdminStaffRegister'
import AdminStaffEdit from './pages/admin/AdminStaffEdit'
import AdminPatientList from './pages/admin/AdminPatientList'

// Layouts
import DoctorLayout from './components/layout/DoctorLayout'
import StaffLayout from './components/layout/StaffLayout'

function RootRedirect() {
  const { isAuthenticated, isLoading, role } = useAuthStore()
  if (isLoading) return <LoadingSpinner message="Loading..." />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (role === 'doctor') return <Navigate to="/doctor/dashboard" replace />
  if (role === 'admin') return <Navigate to="/admin/dashboard" replace />
  if (role === 'receptionist') return <Navigate to="/receptionist/dashboard" replace />
  if (role === 'clinical_assistant') return <Navigate to="/clinical-assistant/dashboard" replace />
  return <Navigate to="/patient/dashboard" replace />
}

export default function App() {
  const { init, isLoading } = useAuthStore()

  useEffect(() => { init() }, [])

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner message="Initializing NeuroWellness..." />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Admin routes */}
        <Route path="/admin/dashboard" element={
          <ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>
        } />
        <Route path="/admin/clinics" element={
          <ProtectedRoute requiredRole="admin"><AdminClinicList /></ProtectedRoute>
        } />
        <Route path="/admin/staff" element={
          <ProtectedRoute requiredRole="admin"><AdminStaffList /></ProtectedRoute>
        } />
        <Route path="/admin/staff/register" element={
          <ProtectedRoute requiredRole="admin"><AdminStaffRegister /></ProtectedRoute>
        } />
        <Route path="/admin/staff/:staffId/edit" element={
          <ProtectedRoute requiredRole="admin"><AdminStaffEdit /></ProtectedRoute>
        } />
        <Route path="/admin/patients" element={
          <ProtectedRoute requiredRole="admin"><AdminPatientList /></ProtectedRoute>
        } />

        {/* Doctor routes */}
        <Route path="/doctor/dashboard" element={
          <ProtectedRoute requiredRole="doctor"><DoctorDashboard /></ProtectedRoute>
        } />
        <Route path="/doctor/patients" element={
          <ProtectedRoute requiredRole="doctor"><PatientList /></ProtectedRoute>
        } />
        <Route path="/doctor/patients/register" element={
          <ProtectedRoute requiredRole="doctor"><DoctorRegisterPatient /></ProtectedRoute>
        } />
        <Route path="/doctor/patients/:patientId" element={
          <ProtectedRoute requiredRole="doctor"><PatientDetail /></ProtectedRoute>
        } />
        <Route path="/doctor/patients/:patientId/scores/:instanceId" element={
          <ProtectedRoute requiredRole="doctor">
            <ScoreInstanceDetail Layout={DoctorLayout} />
          </ProtectedRoute>
        } />
        <Route path="/doctor/patients/:patientId/anamnesis" element={
          <ProtectedRoute requiredRole="doctor"><AnamnesisPage /></ProtectedRoute>
        } />

        {/* Patient routes */}
        <Route path="/patient/dashboard" element={
          <ProtectedRoute requiredRole="patient"><PatientDashboard /></ProtectedRoute>
        } />
        <Route path="/patient/assessments" element={
          <ProtectedRoute requiredRole="patient"><MyAssessments /></ProtectedRoute>
        } />
        <Route path="/patient/scores" element={
          <ProtectedRoute requiredRole="patient"><MyScores /></ProtectedRoute>
        } />
        <Route path="/patient/scores/:instanceId" element={
          <ProtectedRoute requiredRole="patient"><ScoreDetailPage /></ProtectedRoute>
        } />
        <Route path="/patient/anamnesis" element={
          <ProtectedRoute requiredRole="patient"><AnamnesisPage /></ProtectedRoute>
        } />

        {/* Receptionist routes */}
        <Route path="/receptionist/dashboard" element={
          <ProtectedRoute requiredRole="receptionist"><ReceptionistDashboard /></ProtectedRoute>
        } />
        <Route path="/receptionist/patients" element={
          <ProtectedRoute requiredRole="receptionist"><ReceptionistPatientList /></ProtectedRoute>
        } />
        <Route path="/receptionist/patients/register" element={
          <ProtectedRoute requiredRole="receptionist"><ReceptionistRegisterPatient /></ProtectedRoute>
        } />
        <Route path="/receptionist/patients/:patientId" element={
          <ProtectedRoute requiredRole="receptionist"><ReceptionistPatientDetail /></ProtectedRoute>
        } />

        {/* Clinical Assistant routes */}
        <Route path="/clinical-assistant/dashboard" element={
          <ProtectedRoute requiredRole="clinical_assistant"><ClinicalAssistantDashboard /></ProtectedRoute>
        } />
        <Route path="/clinical-assistant/patients" element={
          <ProtectedRoute requiredRole="clinical_assistant"><ClinicalAssistantPatientList /></ProtectedRoute>
        } />
        <Route path="/clinical-assistant/patients/:patientId" element={
          <ProtectedRoute requiredRole="clinical_assistant"><ClinicalAssistantPatientDetail /></ProtectedRoute>
        } />
        <Route path="/clinical-assistant/patients/:patientId/scores/:instanceId" element={
          <ProtectedRoute requiredRole="clinical_assistant">
            <ScoreInstanceDetail Layout={StaffLayout} />
          </ProtectedRoute>
        } />

        {/* Assessment — shared */}
        <Route path="/assessment" element={
          <ProtectedRoute><AssessmentPage /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
