import { useAuthStore } from '../store/authStore'

export function useAuth() {
  const { user, profile, role, isLoading, isAuthenticated, login, logout, register } = useAuthStore()
  return { user, profile, role, isLoading, isAuthenticated, login, logout, register }
}
