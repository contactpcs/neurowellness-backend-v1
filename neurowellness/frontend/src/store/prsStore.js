import { create } from 'zustand'
import api from '../lib/api'

export const usePrsStore = create((set, get) => ({
  // ── Catalogue ──────────────────────────────────────────────
  scales: [],
  conditions: [],

  // ── Active disease session ──────────────────────────────────
  // activeSession: { instance_id, disease_id, disease_name, scales: [...], currentScaleIndex }
  // Each scale in scales: { scale_id, scale_name, scale_code, questions: [...], is_completed }
  activeSession: null,
  currentQuestionIndex: 0,
  responses: {},          // { [question_index]: { value, label } } for current scale
  submittedScore: null,   // last submitted scale score result
  completedScores: [],    // [{ scale_name, score }] accumulated across scales
  isLoading: false,

  // ── Catalogue fetchers ─────────────────────────────────────
  fetchScales: async () => {
    const res = await api.get('/prs/scales?limit=100')
    set({ scales: res.data.data })
  },

  fetchConditions: async () => {
    const res = await api.get('/prs/conditions')
    set({ conditions: res.data.data })
  },

  // ── Disease assessment (single call for entire disease) ────

  /**
   * Start (or resume) a disease-level assessment.
   * Calls POST /prs/assessment/start with disease_id.
   * Returns the instance with ALL scales pre-loaded (questions included).
   * Options are fetched in parallel for all pending (non-completed) scales.
   */
  startDiseaseAssessment: async (disease_id, taken_by = 'patient', patient_id = null) => {
    set({ isLoading: true })
    const body = { disease_id, taken_by }
    if (patient_id) body.patient_id = patient_id

    const res = await api.post('/prs/assessment/start', body)
    const { instance_id, disease_name, scales, is_resumed } = res.data.data

    // Options are now embedded in each question by the backend — no extra fetches needed
    const enrichedScales = scales.map(scale => {
      if (scale.is_completed) return scale
      const enrichedQuestions = (scale.questions || []).map(q => ({
        ...q,
        question_type: q.answer_type || 'radio',
        options:        q.options || [],
      }))
      return { ...scale, questions: enrichedQuestions }
    })

    // Find first non-completed scale index
    const firstPendingIdx = enrichedScales.findIndex(s => !s.is_completed)

    set({
      activeSession: {
        instance_id,
        disease_id,
        disease_name,
        scales: enrichedScales,
        currentScaleIndex: firstPendingIdx >= 0 ? firstPendingIdx : 0,
      },
      currentQuestionIndex: 0,
      responses: {},
      submittedScore: null,
      completedScores: [],
      isLoading: false,
    })
    return { instance_id, disease_name, scales: enrichedScales, is_resumed }
  },

  // ── Per-question navigation ────────────────────────────────
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

  // ── Submit current scale ───────────────────────────────────
  submitCurrentScale: async () => {
    const { activeSession, responses } = get()
    if (!activeSession) throw new Error('No active session')
    set({ isLoading: true })

    const currentScale = activeSession.scales[activeSession.currentScaleIndex]
    const responseList = Object.entries(responses).map(([idx, r]) => ({
      question_index: parseInt(idx),
      response_value: r.value,
      response_label: r.label,
    }))

    const res = await api.post('/prs/assessment/submit', {
      instance_id: activeSession.instance_id,
      scale_id:    currentScale.scale_id,
      responses:   responseList,
    })
    set({ submittedScore: res.data.data, isLoading: false })
    return res.data.data
  },

  // ── Advance to next pending scale ──────────────────────────
  advanceToNextScale: () => {
    const { activeSession, submittedScore } = get()
    if (!activeSession) return false

    const { scales, currentScaleIndex } = activeSession
    const currentScale = scales[currentScaleIndex]

    // Record this scale's score in completedScores
    const newCompleted = [
      ...get().completedScores,
      { scale_name: currentScale?.scale_name || 'Scale', score: submittedScore },
    ]

    // Find next non-completed scale
    const nextIdx = scales.findIndex((s, i) => i > currentScaleIndex && !s.is_completed)

    if (nextIdx === -1) {
      // All scales done
      set({
        completedScores: newCompleted,
        activeSession: { ...activeSession, currentScaleIndex },
        currentQuestionIndex: 0,
        responses: {},
        submittedScore: null,
        isLoading: false,
      })
      return false
    }

    set({
      activeSession: { ...activeSession, currentScaleIndex: nextIdx },
      currentQuestionIndex: 0,
      responses: {},
      submittedScore: null,
      completedScores: newCompleted,
      isLoading: false,
    })
    return true
  },

  skipCurrentScale: () => {
    const { activeSession } = get()
    if (!activeSession) return false
    const { scales, currentScaleIndex } = activeSession
    const nextIdx = scales.findIndex((s, i) => i > currentScaleIndex && !s.is_completed)
    if (nextIdx === -1) return false
    set({
      activeSession: { ...activeSession, currentScaleIndex: nextIdx },
      currentQuestionIndex: 0,
      responses: {},
      submittedScore: null,
    })
    return true
  },

  resetAssessment: () => set({
    activeSession: null,
    currentQuestionIndex: 0,
    responses: {},
    submittedScore: null,
    completedScores: [],
    isLoading: false,
  }),
}))
