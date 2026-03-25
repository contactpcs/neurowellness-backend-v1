import { create } from 'zustand'
import api from '../lib/api'

export const usePrsStore = create((set, get) => ({
  scales: [],
  conditions: [],
  activeSession: null,   // { assessment_session_id, scale: { ...scale, questions, branches } }
  currentQuestionIndex: 0,
  responses: {},
  submittedScore: null,
  isLoading: false,

  fetchScales: async () => {
    const res = await api.get('/prs/scales?limit=100')
    set({ scales: res.data.data })
  },

  fetchConditions: async () => {
    const res = await api.get('/prs/conditions')
    set({ conditions: res.data.data })
  },

  startAssessment: async (scale_id, taken_by = 'patient', patient_id = null) => {
    set({ isLoading: true })
    const body = { scale_id, taken_by }
    if (patient_id) body.patient_id = patient_id
    const res = await api.post('/prs/assessment/start', body)
    const { assessment_session_id, scale } = res.data.data
    set({
      activeSession: { assessment_session_id, scale_id, scale },
      currentQuestionIndex: 0,
      responses: {},
      submittedScore: null,
      isLoading: false,
    })
    return { assessment_session_id, scale }
  },

  setResponse: (question_index, value, label = null) => {
    set((state) => ({
      responses: {
        ...state.responses,
        [question_index]: { value: String(value), label },
      },
    }))
  },

  nextQuestion: () => set((state) => ({
    currentQuestionIndex: state.currentQuestionIndex + 1,
  })),

  prevQuestion: () => set((state) => ({
    currentQuestionIndex: Math.max(0, state.currentQuestionIndex - 1),
  })),

  goToQuestion: (index) => set({ currentQuestionIndex: index }),

  submitAssessment: async () => {
    const { activeSession, responses, scale_id } = get()
    if (!activeSession) throw new Error('No active session')
    set({ isLoading: true })
    const responseList = Object.entries(responses).map(([idx, r]) => ({
      question_index: parseInt(idx),
      response_value: r.value,
      response_label: r.label,
    }))
    const res = await api.post('/prs/assessment/submit', {
      assessment_session_id: activeSession.assessment_session_id,
      scale_id: activeSession.scale_id,
      responses: responseList,
    })
    set({ submittedScore: res.data.data, isLoading: false })
    return res.data.data
  },

  resetAssessment: () => set({
    activeSession: null,
    currentQuestionIndex: 0,
    responses: {},
    submittedScore: null,
    isLoading: false,
  }),
}))
