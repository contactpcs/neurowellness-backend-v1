import { create } from 'zustand'
import api from '../lib/api'

function upsert(list, appt) {
  if (!appt || !appt.appointment_id) return list
  const idx = list.findIndex(a => a.appointment_id === appt.appointment_id)
  if (idx === -1) return [appt, ...list]
  const next = list.slice()
  next[idx] = { ...next[idx], ...appt }
  return next
}

export const useAppointmentsStore = create((set, get) => ({
  appointments: [],
  doctors: [],
  slots: [],
  requests: [],
  loading: false,
  error: null,

  fetchAppointments: async (params = {}) => {
    set({ loading: true, error: null })
    try {
      const res = await api.get('/appointments', { params: { limit: 100, ...params } })
      set({ appointments: res.data.data || [], loading: false })
    } catch (e) {
      set({ loading: false, error: e.response?.data?.detail || 'Failed to load appointments' })
    }
  },

  fetchClinicDoctors: async () => {
    const res = await api.get('/schedule/clinic/doctors')
    set({ doctors: res.data.data || [] })
    return res.data.data || []
  },

  fetchSlots: async (doctorId, fromDate, toDate, includeUnavailable = false) => {
    const res = await api.get(`/schedule/doctor/${doctorId}/slots`, {
      params: { from_date: fromDate, to_date: toDate || fromDate, include_unavailable: includeUnavailable },
    })
    set({ slots: res.data.data || [] })
    return res.data.data || []
  },

  book: async (payload) => {
    const res = await api.post('/appointments', payload)
    const appt = res.data.data
    set(s => ({ appointments: upsert(s.appointments, appt) }))
    return appt
  },

  cancel: async (id, reason) => {
    const res = await api.post(`/appointments/${id}/cancel`, { cancellation_reason: reason })
    set(s => ({ appointments: upsert(s.appointments, res.data.data) }))
    return res.data.data
  },

  reschedule: async (id, payload) => {
    // payload: { appointment_date, start_time, reason? }
    const res = await api.post(`/appointments/${id}/reschedule`, payload)
    const newAppt = res.data.data
    // old appointment becomes 'rescheduled' — refetch keeps the board honest
    set(s => ({ appointments: upsert(s.appointments, newAppt) }))
    return newAppt
  },

  action: async (id, name) => {
    // name: confirm | check-in | start | complete | no-show
    const res = await api.post(`/appointments/${id}/${name}`)
    set(s => ({ appointments: upsert(s.appointments, res.data.data) }))
    return res.data.data
  },

  // ── appointment requests ───────────────────────────────────
  fetchRequests: async (status) => {
    set({ loading: true, error: null })
    try {
      const res = await api.get('/appointment-requests', { params: { ...(status ? { status } : {}), limit: 100 } })
      set({ requests: res.data.data || [], loading: false })
    } catch (e) {
      set({ loading: false, error: e.response?.data?.detail || 'Failed to load requests' })
    }
  },

  submitRequest: async (payload) => {
    const res = await api.post('/appointment-requests', payload)
    return res.data.data
  },

  submitRescheduleRequest: async (appointmentId, payload) => {
    const res = await api.post(`/appointments/${appointmentId}/request-reschedule`, payload)
    return res.data.data
  },

  cancelRequest: async (id) => {
    const res = await api.post(`/appointment-requests/${id}/cancel`)
    set(s => ({ requests: s.requests.map(r => r.request_id === id ? res.data.data : r) }))
    return res.data.data
  },

  approveRequest: async (id, payload) => {
    const res = await api.post(`/appointment-requests/${id}/approve`, payload)
    set(s => ({ requests: s.requests.filter(r => r.request_id !== id) }))
    return res.data.data
  },

  rejectRequest: async (id, reviewNotes) => {
    const res = await api.post(`/appointment-requests/${id}/reject`, { review_notes: reviewNotes })
    set(s => ({ requests: s.requests.filter(r => r.request_id !== id) }))
    return res.data.data
  },

  applyRequestSocketEvent: (event, payload) => {
    if (!event?.startsWith('appointment_request:')) return
    const id = payload.request?.request_id || payload.request_id
    if (!id) return
    set(s => {
      if (event === 'appointment_request:created' && payload.request) {
        const exists = s.requests.some(r => r.request_id === id)
        return { requests: exists ? s.requests : [payload.request, ...s.requests] }
      }
      // approved / rejected / cancelled / expired → drop from the pending inbox
      return { requests: s.requests.filter(r => r.request_id !== id) }
    })
  },

  // ── realtime ────────────────────────────────────────────────
  applySocketEvent: (event, payload) => {
    if (!event?.startsWith('appointment:')) return
    set(s => {
      let list = s.appointments
      if (payload.appointment) {
        list = upsert(list, payload.appointment)
      } else if (payload.new_appointment) {
        list = upsert(list, payload.new_appointment)
        if (payload.old_appointment_id) {
          list = list.map(a => a.appointment_id === payload.old_appointment_id
            ? { ...a, status: 'rescheduled' } : a)
        }
      } else if (payload.appointment_id) {
        const status = event === 'appointment:cancelled' ? 'cancelled'
          : event === 'appointment:no_show' ? 'no_show'
          : event === 'appointment:completed' ? 'completed'
          : undefined
        if (status) {
          list = list.map(a => a.appointment_id === payload.appointment_id
            ? { ...a, status } : a)
        }
      }
      return { appointments: list }
    })
  },
}))
