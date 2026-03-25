import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { usePrsStore } from '../../store/prsStore'

const SEVERITY_COLORS = {
  minimal: '#16a34a', mild: '#ca8a04', moderate: '#ea580c',
  severe: '#dc2626', normal: '#16a34a', 'borderline-high': '#ca8a04',
  high: '#dc2626', default: '#6b7280',
}

function getSeverityColor(level) {
  return SEVERITY_COLORS[level?.toLowerCase()] || SEVERITY_COLORS.default
}

export default function ScoreCard({ score, scaleName }) {
  const navigate = useNavigate()
  const { role } = useAuthStore()
  const { resetAssessment } = usePrsStore()

  if (!score) return null

  const dashPath = role === 'doctor' ? '/doctor/dashboard' : '/patient/dashboard'
  const pct = score.max_possible ? Math.round((score.total_score / score.max_possible) * 100) : null
  const color = getSeverityColor(score.severity_level)

  const subscales = score.subscale_scores && typeof score.subscale_scores === 'object'
    ? Object.entries(score.subscale_scores)
    : []
  const riskFlags = score.risk_flags || []

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>{scaleName}</h2>
        <p style={{ color: '#6b7280', marginBottom: '24px', fontSize: '14px' }}>Assessment Complete</p>

        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: '#f9fafb', borderRadius: '12px', padding: '24px 40px', marginBottom: '24px' }}>
          <span style={{ fontSize: '48px', fontWeight: '800', color: '#111827', lineHeight: 1 }}>
            {score.total_score}
          </span>
          {score.max_possible > 0 && (
            <span style={{ color: '#9ca3af', fontSize: '16px', marginTop: '4px' }}>
              / {score.max_possible} {pct != null ? `(${pct}%)` : ''}
            </span>
          )}
        </div>

        {score.severity_label && (
          <div style={{ display: 'inline-block', background: color + '20', color, borderRadius: '20px', padding: '6px 20px', fontWeight: '700', fontSize: '15px', marginBottom: '16px' }}>
            {score.severity_label}
          </div>
        )}
      </div>

      {/* Risk Flags */}
      {riskFlags.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
          <h3 style={{ color: '#dc2626', fontWeight: '600', marginBottom: '10px', fontSize: '14px' }}>Clinical Alerts</h3>
          {riskFlags.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', fontSize: '14px' }}>
              <span>{f.priority === 'high' ? '🔴' : '🟡'}</span>
              <span>{f.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Subscale Breakdown */}
      {subscales.length > 0 && (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '16px' }}>
          <h3 style={{ fontWeight: '600', marginBottom: '14px', fontSize: '14px', color: '#374151' }}>Subscale Breakdown</h3>
          {subscales.map(([key, sub]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: '14px' }}>
              <span style={{ color: '#374151' }}>{sub.name || key}</span>
              <span style={{ fontWeight: '600', color: '#4f46e5' }}>
                {sub.score ?? sub.weighted ?? sub.raw}
                {sub.severity?.label && <span style={{ marginLeft: '8px', color: getSeverityColor(sub.severity.level), fontWeight: '500' }}>({sub.severity.label})</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button
          onClick={() => { resetAssessment(); navigate(dashPath) }}
          style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '14px' }}
        >
          Back to Dashboard
        </button>
        <button
          onClick={() => { resetAssessment(); navigate(role === 'patient' ? '/patient/assessments' : '/doctor/patients') }}
          style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
        >
          Take Another Assessment
        </button>
      </div>
    </div>
  )
}
