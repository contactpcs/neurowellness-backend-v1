import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, isLoading, role } = useAuthStore()

  if (isLoading) return <LoadingSpinner message="Authenticating..." />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  if (requiredRole && role !== requiredRole && role !== 'admin') {
    if (role === 'doctor') return <Navigate to="/doctor/dashboard" replace />
    if (role === 'patient') return <Navigate to="/patient/dashboard" replace />
    return <Navigate to="/login" replace />
  }

  return children
}
