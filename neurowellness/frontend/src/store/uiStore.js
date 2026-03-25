import { create } from 'zustand'

export const useUiStore = create((set) => ({
  sidebarOpen: true,
  notifications: [],
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setNotifications: (notifications) => set({ notifications }),
}))
