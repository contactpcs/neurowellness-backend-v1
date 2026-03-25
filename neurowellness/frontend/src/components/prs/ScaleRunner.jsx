import { useState, useMemo } from 'react'
import { usePrsStore } from '../../store/prsStore'
import QuestionRenderer from './QuestionRenderer'

// ── Branching helpers ────────────────────────────────────────────────────────

function evalOperator(actual, operator, expected) {
  const a = parseFloat(actual)
  const e = parseFloat(expected)
  switch (operator) {
    case '==': case '===': return String(actual) === String(expected)
    case '!=': case '!==': return String(actual) !== String(expected)
    case '>':  return !isNaN(a) && !isNaN(e) && a > e
    case '>=': return !isNaN(a) && !isNaN(e) && a >= e
    case '<':  return !isNaN(a) && !isNaN(e) && a < e
    case '<=': return !isNaN(a) && !isNaN(e) && a <= e
    case 'present': return actual !== undefined && actual !== null && actual !== ''
    default:   return String(actual) === String(expected)
  }
}

function getResponseValue(responses, questionIndex) {
  const r = responses[questionIndex]
  if (r === undefined || r === null) return undefined
  return r?.value ?? r
}

/**
 * Evaluate prs_question_branches rules and return:
 *  - hiddenIndices: Set of question_index values that should be hidden
 *  - skipToIndex: if a skip rule fires, the target index to jump to (or Infinity for skip_to_end)
 */
function evaluateBranches(branches, responses, currentIndex) {
  const hiddenIndices = new Set()
  let skipToIndex = null

  for (const branch of branches) {
    const triggerIdx = branch.trigger_question_index
    if (triggerIdx === undefined || triggerIdx === null) continue

    const actualValue = getResponseValue(responses, triggerIdx)
    const fired = evalOperator(actualValue, branch.trigger_operator, branch.trigger_value)

    if (!fired) continue

    if (branch.branch_type === 'show_if') {
      // Show target ONLY if fired — if NOT fired, hide it
      // We re-evaluate: this rule says "show target when trigger matches"
      // We'll compute hidden as: questions that have a show_if rule but rule didn't fire
      // Handled in the visible filter below
    }

    if (branch.branch_type === 'skip_to_question' && triggerIdx === currentIndex) {
      skipToIndex = branch.target_question_index
    }
    if (branch.branch_type === 'skip_to_end' && triggerIdx === currentIndex) {
      skipToIndex = Infinity
    }
  }

  // Build hidden set: for each show_if rule, if rule does NOT fire → hide target
  const showIfTargets = new Set()
  const showIfFired = new Set()

  for (const branch of branches) {
    if (branch.branch_type !== 'show_if') continue
    const targetIdx = branch.target_question_index
    if (targetIdx === null || targetIdx === undefined) continue
    showIfTargets.add(targetIdx)

    const triggerIdx = branch.trigger_question_index
    if (triggerIdx === null || triggerIdx === undefined) continue
    const actualValue = getResponseValue(responses, triggerIdx)
    if (evalOperator(actualValue, branch.trigger_operator, branch.trigger_value)) {
      showIfFired.add(targetIdx)
    }
  }

  for (const idx of showIfTargets) {
    if (!showIfFired.has(idx)) hiddenIndices.add(idx)
  }

  return { hiddenIndices, skipToIndex }
}

/**
 * Evaluate question-level conditionalOn
 */
function evalConditionalOn(conditionalOn, responses) {
  if (!conditionalOn) return true
  let cond = conditionalOn
  if (typeof cond === 'string') {
    try { cond = JSON.parse(cond) } catch { return true }
  }
  if (!cond) return true
  const { questionIndex, operator, value } = cond
  const actual = getResponseValue(responses, questionIndex)
  if (actual === undefined) return false
  return evalOperator(actual, operator, value)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ScaleRunner({ onComplete }) {
  const {
    activeSession, currentQuestionIndex, responses,
    setResponse, nextQuestion, prevQuestion, goToQuestion,
    submitAssessment, isLoading,
  } = usePrsStore()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!activeSession) return null

  const { scale } = activeSession
  const questions = scale.questions || []
  const branches = scale.branches || []

  // ── Compute visible questions ──────────────────────────────────────────────
  const { hiddenIndices } = useMemo(
    () => evaluateBranches(branches, responses, currentQuestionIndex),
    [branches, responses, currentQuestionIndex]
  )

  const visibleQuestions = questions.filter(q => {
    if (hiddenIndices.has(q.question_index)) return false
    return evalConditionalOn(q.conditional_on, responses)
  })

  const current = visibleQuestions[currentQuestionIndex]
  const isLast = currentQuestionIndex >= visibleQuestions.length - 1
  const currentValue = current
    ? (() => { const r = responses[current.question_index]; return r?.value ?? r })()
    : null

  // ── Check skip rules after answering ──────────────────────────────────────
  const getNextIndex = () => {
    if (!current) return currentQuestionIndex + 1
    const { skipToIndex } = evaluateBranches(branches, responses, current.question_index)
    if (skipToIndex === Infinity) return visibleQuestions.length // triggers submit
    if (skipToIndex !== null) {
      // Find visible question at or after skipToIndex
      const idx = visibleQuestions.findIndex(q => q.question_index >= skipToIndex)
      return idx === -1 ? visibleQuestions.length : idx
    }
    return currentQuestionIndex + 1
  }

  const handleNext = () => {
    if (current?.is_required && (currentValue === undefined || currentValue === null || currentValue === '')) {
      setError('This question requires an answer.')
      return
    }
    setError('')
    const nextIdx = getNextIndex()
    if (nextIdx >= visibleQuestions.length) {
      handleSubmit()
    } else {
      goToQuestion(nextIdx)
    }
  }

  const handlePrev = () => {
    setError('')
    prevQuestion()
  }

  const handleSubmit = async () => {
    if (current?.is_required && (currentValue === undefined || currentValue === null || currentValue === '')) {
      setError('This question requires an answer.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const score = await submitAssessment()
      if (onComplete) onComplete(score)
    } catch (e) {
      setError(e.response?.data?.detail || 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!current) return <p>No questions available.</p>

  const pct = Math.round((currentQuestionIndex / visibleQuestions.length) * 100)

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      {/* Progress */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>
            Question {currentQuestionIndex + 1} of {visibleQuestions.length}
          </span>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>{pct}%</span>
        </div>
        <div style={{ background: '#e5e7eb', borderRadius: '4px', height: '6px' }}>
          <div style={{
            background: '#4f46e5', height: '6px', borderRadius: '4px',
            width: `${pct}%`, transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Question card */}
      <div style={{ background: '#fff', borderRadius: '12px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' }}>
        {current.question_number && (
          <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '6px', fontWeight: '600' }}>
            Q{current.question_number}
          </p>
        )}
        <p style={{ fontSize: '16px', fontWeight: '500', lineHeight: '1.6', marginBottom: '20px', color: '#111827' }}>
          {current.question_text || current.label}
        </p>
        {current.instructions && (
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '14px', fontStyle: 'italic' }}>
            {current.instructions}
          </p>
        )}
        <QuestionRenderer
          question={current}
          value={currentValue}
          onChange={(val, label) => setResponse(current.question_index, val, label)}
        />
      </div>

      {error && (
        <p style={{ color: '#dc2626', fontSize: '14px', marginBottom: '12px' }}>{error}</p>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button
          onClick={handlePrev}
          disabled={currentQuestionIndex === 0}
          style={{
            padding: '10px 24px', borderRadius: '8px', border: '1px solid #d1d5db',
            background: '#fff', cursor: currentQuestionIndex === 0 ? 'not-allowed' : 'pointer',
            fontSize: '14px', color: '#374151', opacity: currentQuestionIndex === 0 ? 0.5 : 1,
          }}
        >
          Back
        </button>
        {isLast ? (
          <button
            onClick={handleSubmit}
            disabled={submitting || isLoading}
            style={{
              padding: '10px 32px', borderRadius: '8px', border: 'none',
              background: '#059669', color: '#fff', cursor: 'pointer',
              fontSize: '14px', fontWeight: '600', opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Assessment'}
          </button>
        ) : (
          <button
            onClick={handleNext}
            style={{
              padding: '10px 32px', borderRadius: '8px', border: 'none',
              background: '#4f46e5', color: '#fff', cursor: 'pointer',
              fontSize: '14px', fontWeight: '600',
            }}
          >
            Next
          </button>
        )}
      </div>
    </div>
  )
}
