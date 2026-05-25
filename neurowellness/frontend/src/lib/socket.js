import { io } from 'socket.io-client'
import { supabase } from './supabase'

// Backend serves Socket.IO at the API origin (strip the /api/v1 suffix).
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '')

let socket = null

export function getSocket() {
  if (socket) return socket

  socket = io(SOCKET_URL, {
    path: '/socket.io',
    autoConnect: true,
    transports: ['websocket', 'polling'],
    // auth is resolved lazily on every (re)connect so the token stays fresh
    auth: async (cb) => {
      const { data: { session } } = await supabase.auth.getSession()
      cb({ token: session?.access_token || '' })
    },
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
