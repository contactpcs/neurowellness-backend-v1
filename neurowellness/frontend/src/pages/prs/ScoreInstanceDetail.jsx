import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const SEV_COLORS = {
  normal: '#16a34a', minimal: '#16a34a', mild: '#ca8a04', moderate: '#ea580c',
  severe: '#dc2626', very_severe: '#7f1d1d', default: '#6b7280',
}
const sevColor = (l) => SEV_COLORS[l?.toLowerCase()] || SEV_COLORS.default

const S = {
  wrap: { maxWidth: '900px', margin: '0 auto', padding: '24px 16px' },
  back: { background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: '14px', fontWeight: '600', padding: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '4px' },
  card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: '16px' },
  scoreBox: (color) => ({ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: color + '10', border: `2px solid ${color}`, borderRadius: '16px', padding: '16px 32px', margin: '8px 0' }),
  scoreNum: (color) => ({ fontSize: '48px', fontWeight: '800', color, lineHeight: 1 }),
  badge: (color) => ({ display: 'inline-block', background: color + '20', color, borderRadius: '20px', padding: '5px 18px', fontWeight: '700', fontSize: '14px' }),
  section: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '16px' },
  sTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '10px 12px', background: '#f9fafb', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', color: '#374151', verticalAlign: 'top' },
  subRow: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f9fafb', fontSize: '13px' },
  riskBox: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px', marginTop: '6px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' },
  meta: { display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px', color: '#6b7280', marginTop: '8px' },
}

export default function ScoreInstanceDetail({ Layout, backPath }) {
  const { instanceId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/prs/scores/instance/${instanceId}`)
      .then(r => setData(r.data.data))
      .catch(e => setError(e.response?.data?.detail || 'Failed to load score'))
      .finally(() => setLoading(false))
  }, [instanceId])

  const content = () => {
    if (loading) return <LoadingSpinner />
    if (error || !data) return <div style={{ color: '#dc2626', padding: '16px' }}>{error || 'Not found'}</div>

    const { instance, disease_result: dr, weighted_result: wr, scale_results } = data

    const primarySevLevel = wr?.severity_level ?? dr?.overall_severity
    const primarySevLabel = wr?.severity_label ?? dr?.overall_severity_label
    const color = sevColor(primarySevLevel)

    return (
      <div style={S.wrap}>
        <button style={S.back} onClick={() => backPath ? navigate(backPath) : navigate(-1)}>← Back</button>

        {/* Header */}
        <div style={{ ...S.card, textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px', marginBottom: '4px' }}>
            {instance.disease_name || instance.disease_id}
          </p>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>Assessment Result</h1>

          {(dr || wr) ? (
            <>
              <div style={S.twoCol}>
                {dr && (
                  <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                    <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>Overall Score</p>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#111827' }}>
                      {dr.calculated_value}
                      <span style={{ fontSize: '14px', color: '#9ca3af', fontWeight: '400' }}>/{dr.max_possible}</span>
                    </div>
                    {dr.percentage != null && (
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>{Math.round(dr.percentage)}%</div>
                    )}
                    {primarySevLabel && (
                      <div style={{ marginTop: '8px' }}>
                        <span style={S.badge(color)}>{primarySevLabel}</span>
                      </div>
                    )}
                  </div>
                )}
                {wr && (
                  <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                    <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Weighted Score</p>
                    <div style={S.scoreBox(color)}>
                      <span style={S.scoreNum(color)}>{Math.round(wr.disease_score)}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>/ 100</span>
                    </div>
                    {wr.severity_label && (
                      <div><span style={S.badge(color)}>{wr.severity_label}</span></div>
                    )}
                    <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                      {wr.scales_used} / {wr.scales_expected} scales scored
                    </p>
                  </div>
                )}
              </div>
              <div style={S.meta}>
                {instance.completed_at && (
                  <span>Completed: <strong>{new Date(instance.completed_at).toLocaleDateString()}</strong></span>
                )}
                {wr?.missing_scales?.length > 0 && (
                  <span>Missing scales: {wr.missing_scales.join(', ')}</span>
                )}
              </div>
            </>
          ) : (
            <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '12px' }}>No result data yet.</p>
          )}
        </div>

        {/* Per-scale results */}
        {scale_results.length > 0 && (
          <div style={S.section}>
            <h2 style={S.sTitle}>Scale Results</h2>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Scale', 'Score', 'Severity', 'Subscales / Alerts'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scale_results.map((sr) => {
                  const sc = sevColor(sr.severity_level)
                  const subscales = sr.subscale_scores && typeof sr.subscale_scores === 'object'
                    ? Object.entries(sr.subscale_scores) : []
                  const risks = sr.risk_flags || []
                  const pct = sr.max_possible > 0
                    ? Math.round((sr.calculated_value / sr.max_possible) * 100) : null
                  return (
                    <tr key={sr.scale_result_id}>
                      <td style={{ ...S.td, fontWeight: '600', color: '#111827' }}>
                        {sr.scale_name || sr.scale_code || sr.scale_id}
                      </td>
                      <td style={S.td}>
                        <span style={{ fontWeight: '700', fontSize: '16px' }}>{sr.calculated_value}</span>
                        {sr.max_possible > 0 && (
                          <span style={{ color: '#9ca3af', fontSize: '13px' }}>
                            {' '}/ {sr.max_possible}{pct != null ? ` (${pct}%)` : ''}
                          </span>
                        )}
                      </td>
                      <td style={S.td}>
                        {(sr.severity_label || sr.severity_level) ? (
                          <span style={{ background: sc + '20', color: sc, borderRadius: '10px', padding: '3px 10px', fontWeight: '600', fontSize: '12px' }}>
                            {sr.severity_label || sr.severity_level}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={S.td}>
                        {subscales.length > 0 && (
                          <div>
                            {subscales.map(([key, sub]) => (
                              <div key={key} style={S.subRow}>
                                <span style={{ color: '#6b7280' }}>{sub.name || key}</span>
                                <span style={{ fontWeight: '600' }}>
                                  {sub.score ?? sub.weighted ?? sub.raw ?? '—'}
                                  {sub.severity?.label && (
                                    <span style={{ marginLeft: '6px', fontSize: '11px', color: sevColor(sub.severity.level) }}>
                                      {sub.severity.label}
                                    </span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {risks.length > 0 && (
                          <div style={S.riskBox}>
                            {risks.map((f, i) => (
                              <div key={i} style={{ fontSize: '12px', marginBottom: '2px' }}>
                                {f.priority === 'high' ? '🔴' : '🟡'} {f.message}
                              </div>
                            ))}
                          </div>
                        )}
                        {subscales.length === 0 && risks.length === 0 && '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* DiseaseEngine weighted breakdown */}
        {wr?.scale_breakdown && Object.keys(wr.scale_breakdown).length > 0 && (
          <div style={S.section}>
            <h2 style={S.sTitle}>Weighted Score Breakdown</h2>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Scale', 'Raw', 'Max', 'Normalized', 'Effective Weight'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(wr.scale_breakdown).map(([code, b]) => (
                  <tr key={code}>
                    <td style={{ ...S.td, fontWeight: '600' }}>{code}</td>
                    <td style={S.td}>{b.raw}</td>
                    <td style={S.td}>{b.max}</td>
                    <td style={S.td}>{b.normalized}</td>
                    <td style={S.td}>
                      {b.effective_weight != null
                        ? `${Math.round(b.effective_weight * 100)}%`
                        : `${Math.round((b.weight || 0) * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Scale summaries from DB trigger */}
        {dr?.scale_summaries?.length > 0 && (
          <div style={S.section}>
            <h2 style={S.sTitle}>Scale Summaries</h2>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Scale', 'Score', 'Severity'].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {dr.scale_summaries.map((ss, i) => {
                  const sc = sevColor(ss.severity_level)
                  return (
                    <tr key={i}>
                      <td style={{ ...S.td, fontWeight: '600' }}>{ss.scale_code}</td>
                      <td style={S.td}>
                        {ss.score}
                        {ss.percentage != null && (
                          <span style={{ color: '#9ca3af', fontSize: '12px' }}> ({Math.round(ss.percentage)}%)</span>
                        )}
                      </td>
                      <td style={S.td}>
                        {ss.severity_level && (
                          <span style={{ background: sc + '20', color: sc, borderRadius: '10px', padding: '3px 10px', fontWeight: '600', fontSize: '12px' }}>
                            {ss.severity_level}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  if (Layout) return <Layout>{content()}</Layout>
  return content()
}
