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
    // Patient self-registration returns patient_id (pending approval) — no tokens.
    // Backend validates consent_responses and saves them atomically.
    const res = await api.post('/auth/register', {
      full_name: formData.full_name,
      email: formData.email,
      password: formData.password,
      role: formData.role,
      phone: formData.phone || null,
      city: formData.city || null,
      state: formData.state || null,
      country: formData.country || 'India',
      date_of_birth: formData.date_of_birth || null,
      gender: formData.gender || null,
      clinic_id: formData.clinic_id || null,
      address_line1: formData.address_line1 || null,
      pincode: formData.pincode || null,
      specialization: formData.specialization || null,
      license_number: formData.license_number || null,
      medical_history: formData.medical_history || null,
      emergency_contact: formData.emergency_contact || null,
      employee_id: formData.employee_id || null,
      department: formData.department || null,
      designation: formData.designation || null,
      consent_responses: formData.consent_responses || [],
    })

    return res.data.data
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, role: null, isAuthenticated: false })
  },
}))
