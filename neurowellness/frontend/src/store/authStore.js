import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import api from '../lib/api'

const PENDING_KEY = 'nw_pending_profile'

async function syncProfile(formData, token) {
  await api.post(
    '/auth/sync-profile',
    {
      full_name: formData.full_name,
      email: formData.email,
      role: formData.role,
      phone: formData.phone || null,
      city: formData.city || null,
      state: formData.state || null,
      specialization: formData.specialization || null,
      license_number: formData.license_number || null,
      hospital_affiliation: formData.hospital_affiliation || null,
      medical_history: formData.medical_history || null,
      emergency_contact: formData.emergency_contact || null,
    },
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
  )
}

export const useAuthStore = create((set) => ({
  user: null,
  profile: null,
  role: null,
  isLoading: true,
  isAuthenticated: false,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      try {
        const res = await api.get('/auth/me')
        const profile = res.data.data
        set({ user: session.user, profile, role: profile.role, isAuthenticated: true, isLoading: false })
      } catch {
        set({ isLoading: false })
      }
    } else {
      set({ isLoading: false })
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        set({ user: null, profile: null, role: null, isAuthenticated: false })
      }
    })
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    // Sync profile if it was deferred (email confirmation flow)
    const pending = sessionStorage.getItem(PENDING_KEY)
    if (pending) {
      try {
        await syncProfile(JSON.parse(pending), data.session.access_token)
        sessionStorage.removeItem(PENDING_KEY)
      } catch { /* already synced or error — /auth/me will catch it */ }
    }

    try {
      const res = await api.get('/auth/me')
      const profile = res.data.data
      set({ user: data.user, profile, role: profile.role, isAuthenticated: true })
      return profile
    } catch (err) {
      if (err.response?.status === 404) {
        await supabase.auth.signOut()
        const e = new Error('Account setup incomplete. Please register again with your full details.')
        e.code = 'PROFILE_NOT_FOUND'
        throw e
      }
      throw err
    }
  },

  register: async (formData) => {
    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
    })
    if (error) throw error

    if (data.session?.access_token) {
      // Email confirmation is OFF — session available immediately
      await syncProfile(formData, data.session.access_token)
    } else {
      // Email confirmation is ON — no session yet
      // Save profile data to sync after the user confirms + logs in
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(formData))
    }

    return { ...data, emailConfirmationRequired: !data.session }
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, role: null, isAuthenticated: false })
  },
}))
