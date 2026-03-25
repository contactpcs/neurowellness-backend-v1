import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/common/ProtectedRoute'
import LoadingSpinner from './components/common/LoadingSpinner'

import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import DoctorDashboard from './pages/doctor/DoctorDashboard'
import PatientList from './pages/doctor/PatientList'
import PatientDetail from './pages/doctor/PatientDetail'
import PatientDashboard from './pages/patient/PatientDashboard'
import MyAssessments from './pages/patient/MyAssessments'
import MyScores from './pages/patient/MyScores'
import AssessmentPage from './pages/prs/AssessmentPage'

function RootRedirect() {
  const { isAuthenticated, isLoading, role } = useAuthStore()
  if (isLoading) return <LoadingSpinner message="Loading..." />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (role === 'doctor') return <Navigate to="/doctor/dashboard" replace />
  return <Navigate to="/patient/dashboard" replace />
}

export default function App() {
  const { init, isLoading } = useAuthStore()

  useEffect(() => {
    init()
  }, [])

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

        {/* Doctor routes */}
        <Route path="/doctor/dashboard" element={
          <ProtectedRoute requiredRole="doctor"><DoctorDashboard /></ProtectedRoute>
        } />
        <Route path="/doctor/patients" element={
          <ProtectedRoute requiredRole="doctor"><PatientList /></ProtectedRoute>
        } />
        <Route path="/doctor/patients/:patientId" element={
          <ProtectedRoute requiredRole="doctor"><PatientDetail /></ProtectedRoute>
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

        {/* Assessment — accessible by both roles */}
        <Route path="/assessment" element={
          <ProtectedRoute><AssessmentPage /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
