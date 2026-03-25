import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { usePrsStore } from '../../store/prsStore'
import { useAuthStore } from '../../store/authStore'
import ScaleRunner from '../../components/prs/ScaleRunner'
import ScoreCard from '../../components/prs/ScoreCard'
import Navbar from '../../components/layout/Navbar'
import LoadingSpinner from '../../components/common/LoadingSpinner'

export default function AssessmentPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { role } = useAuthStore()
  const { activeSession, submittedScore, startAssessment, resetAssessment, isLoading } = usePrsStore()
  const [error, setError] = useState('')
  const [started, setStarted] = useState(false)

  const scaleId = searchParams.get('scale_id')
  const patientId = searchParams.get('patient_id')
  const takenBy = searchParams.get('taken_by') || (role === 'doctor' && patientId ? 'doctor_on_behalf' : 'patient')

  useEffect(() => {
    if (!scaleId) { navigate(-1); return }
    resetAssessment()
    setStarted(false)
    setError('')
  }, [scaleId])

  const handleStart = async () => {
    setError('')
    try {
      await startAssessment(scaleId, takenBy, patientId || null)
      setStarted(true)
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Failed to start assessment')
    }
  }

  if (!scaleId) return null

  return (
    <div>
      <Navbar />
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 16px' }}>
        {/* Score result */}
        {submittedScore && (
          <ScoreCard
            score={submittedScore}
            scaleName={activeSession?.scale?.name || 'Assessment'}
          />
        )}

        {/* Running assessment */}
        {started && !submittedScore && !isLoading && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>
                {activeSession?.scale?.name}
              </h1>
              {activeSession?.scale?.instructions && (
                <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '6px', lineHeight: '1.6' }}>
                  {activeSession.scale.instructions}
                </p>
              )}
            </div>
            <ScaleRunner onComplete={() => {}} />
          </div>
        )}

        {/* Loading */}
        {isLoading && <LoadingSpinner message="Loading assessment..." />}

        {/* Not started */}
        {!started && !isLoading && !submittedScore && (
          <div style={{ textAlign: 'center', background: '#fff', borderRadius: '12px', padding: '48px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px', color: '#111827' }}>Start Assessment</h1>
            <p style={{ color: '#6b7280', marginBottom: '32px', fontSize: '15px' }}>
              You're about to begin this clinical assessment. Please answer all questions honestly and to the best of your ability.
            </p>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '14px' }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => navigate(-1)}
                style={{ padding: '12px 28px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '14px' }}
              >
                Go Back
              </button>
              <button
                onClick={handleStart}
                style={{ padding: '12px 32px', borderRadius: '8px', border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer', fontSize: '15px', fontWeight: '600' }}
              >
                Begin Assessment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
