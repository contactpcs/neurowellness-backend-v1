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
        const res = await api.get('/auth/login')
        const profile = res.data.data
        set({ user: session.user, profile, role: profile.role, isAuthenticated: true, isLoading: false })
      } catch {
        set({ isLoading: false })
      }
    } else {
      set({ isLoading: false })
    }

    supabase.auth.onAuthStateChange(async (event) => {
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
      } catch { /* already synced or error — /auth/login will catch it */ }
    }

    try {
      const res = await api.get('/auth/login')
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
    // Backend uses admin API to create auto-confirmed user (no email verification)
    const res = await api.post('/auth/register', {
      full_name: formData.full_name,
      email: formData.email,
      password: formData.password,
      role: formData.role,
      phone: formData.phone || null,
      city: formData.city || null,
      state: formData.state || null,
      specialization: formData.specialization || null,
      license_number: formData.license_number || null,
      hospital_affiliation: formData.hospital_affiliation || null,
      medical_history: formData.medical_history || null,
      emergency_contact: formData.emergency_contact || null,
      employee_id: formData.employee_id || null,
      department: formData.department || null,
      designation: formData.designation || null,
    })

    const { access_token, refresh_token } = res.data.data

    // Persist session in Supabase so api.js interceptor gets the token
    await supabase.auth.setSession({ access_token, refresh_token })

    // Fetch profile and update store so the user is logged in immediately
    const profileRes = await api.get('/auth/login', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const profile = profileRes.data.data
    const { data: { session } } = await supabase.auth.getSession()
    set({ user: session?.user ?? null, profile, role: profile.role, isAuthenticated: true })

    return profile
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, role: null, isAuthenticated: false })
  },
}))
