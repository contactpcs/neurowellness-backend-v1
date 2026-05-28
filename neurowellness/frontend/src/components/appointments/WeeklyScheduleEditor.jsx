import { useEffect, useState } from 'react'
import api from '../../lib/api'

// day_of_week mapping: DB uses 0=Sun..6=Sat
const DAYS = [
  { dow: 1, name: 'Monday'    },
  { dow: 2, name: 'Tuesday'   },
  { dow: 3, name: 'Wednesday' },
  { dow: 4, name: 'Thursday'  },
  { dow: 5, name: 'Friday'    },
  { dow: 6, name: 'Saturday'  },
  { dow: 0, name: 'Sunday'    },
]

const DURATIONS = [60, 90, 120]
const DEFAULT_ROW = { enabled: false, start: '09:00', end: '17:00', dur: 60, bStart: '', bEnd: '' }

const S = {
  card: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' },
  h2: { fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '14px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '8px 6px', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '8px 6px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' },
  input: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', width: '110px' },
  select: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' },
  btn: (bg) => ({ background: bg, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }),
  ghost: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '7px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  err: { color: '#dc2626', fontSize: '13px', marginTop: '10px' },
  ok: { color: '#059669', fontSize: '13px', marginTop: '10px', fontWeight: '600' },
  ovRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: '14px' },
  formRow: { display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: '8px', alignItems: 'center', marginTop: '10px' },
  empty: { color: '#9ca3af', fontSize: '13px' },
}

const toHHMM = (t) => t ? String(t).slice(0, 5) : ''
const toHHMMSS = (t) => (t && t.length === 5) ? `${t}:00` : t

export default function WeeklyScheduleEditor({ doctorId = null, title = 'My Weekly Schedule' }) {
  // doctorId = null  → self mode  (/schedule/my)
  // doctorId set     → admin mode (/schedule/doctor/{id})
  const isAdminMode = Boolean(doctorId)
  const readUrl  = isAdminMode ? `/schedule/doctor/${doctorId}` : '/schedule/my'
  const writeUrl = isAdminMode ? `/schedule/doctor/${doctorId}` : '/schedule/my'
  const ovListUrl = readUrl                       // GET returns overrides too
  const ovAddUrl  = isAdminMode ? `/schedule/doctor/${doctorId}/overrides` : '/schedule/my/overrides'
  const ovDelUrl  = (id) => isAdminMode ? `/schedule/doctor/${doctorId}/overrides/${id}` : `/schedule/my/overrides/${id}`

  const [rows, setRows] = useState(() => Object.fromEntries(DAYS.map(d => [d.dow, { ...DEFAULT_ROW }])))
  const [overrides, setOverrides] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // override form
  const [ovDate, setOvDate] = useState('')
  const [ovType, setOvType] = useState('off')
  const [ovStart, setOvStart] = useState('09:00')
  const [ovEnd, setOvEnd] = useState('12:00')
  const [ovReason, setOvReason] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const res = await api.get(readUrl)
      const data = res.data.data || { weekly: [], overrides: [] }
      const next = Object.fromEntries(DAYS.map(d => [d.dow, { ...DEFAULT_ROW }]))
      for (const w of (data.weekly || [])) {
        next[w.day_of_week] = {
          enabled: w.is_active !== false,
          start: toHHMM(w.start_time),
          end: toHHMM(w.end_time),
          dur: Number(w.slot_duration_minutes) || 60,
          bStart: w.break_start ? toHHMM(w.break_start) : '',
          bEnd:   w.break_end   ? toHHMM(w.break_end)   : '',
        }
      }
      setRows(next)
      setOverrides(data.overrides || [])
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load schedule')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [doctorId])

  const updateRow = (dow, patch) => setRows(prev => ({ ...prev, [dow]: { ...prev[dow], ...patch } }))

  const validate = () => {
    for (const d of DAYS) {
      const r = rows[d.dow]
      if (!r.enabled) continue
      if (!r.start || !r.end) return `${d.name}: start/end required`
      if (r.end <= r.start) return `${d.name}: end must be after start`
      // ensure window long enough for at least one slot
      const [sh, sm] = r.start.split(':').map(Number); const [eh, em] = r.end.split(':').map(Number)
      const mins = (eh * 60 + em) - (sh * 60 + sm)
      if (mins < r.dur) return `${d.name}: window shorter than slot duration`
      if (r.bStart || r.bEnd) {
        if (!r.bStart || !r.bEnd) return `${d.name}: break needs both start and end`
        if (r.bEnd <= r.bStart) return `${d.name}: break end must be after break start`
        if (r.bStart < r.start || r.bEnd > r.end) return `${d.name}: break must be inside working hours`
      }
    }
    return null
  }

  const save = async () => {
    const v = validate()
    if (v) return setError(v)
    setSaving(true); setError(''); setSuccess('')
    try {
      const items = DAYS.filter(d => rows[d.dow].enabled).map(d => {
        const r = rows[d.dow]
        return {
          day_of_week: d.dow,
          start_time: toHHMMSS(r.start),
          end_time:   toHHMMSS(r.end),
          slot_duration_minutes: Number(r.dur),
          break_start: r.bStart ? toHHMMSS(r.bStart) : null,
          break_end:   r.bEnd   ? toHHMMSS(r.bEnd)   : null,
          is_active: true,
        }
      })
      await api.put(writeUrl, { items })
      setSuccess('Schedule saved')
      load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  const addOverride = async () => {
    if (!ovDate) return setError('Override date required')
    setError('')
    try {
      const body = ovType === 'off'
        ? { override_date: ovDate, is_available: false, reason: ovReason || null }
        : { override_date: ovDate, is_available: true, start_time: toHHMMSS(ovStart), end_time: toHHMMSS(ovEnd), reason: ovReason || null }
      await api.post(ovAddUrl, body)
      setOvDate(''); setOvReason(''); setOvStart('09:00'); setOvEnd('12:00'); setOvType('off')
      load()
    } catch (e) { setError(e.response?.data?.detail || 'Add failed') }
  }

  const removeOverride = async (id) => {
    if (!confirm('Remove this override?')) return
    try { await api.delete(ovDelUrl(id)); load() }
    catch (e) { setError(e.response?.data?.detail || 'Delete failed') }
  }

  if (loading) return <p style={{ color: '#6b7280' }}>Loading schedule…</p>

  return (
    <>
      <div style={S.card}>
        <div style={S.h2}>{title}</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Work</th>
              <th style={S.th}>Day</th>
              <th style={S.th}>Start</th>
              <th style={S.th}>End</th>
              <th style={S.th}>Slot duration</th>
              <th style={S.th}>Break start</th>
              <th style={S.th}>Break end</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map(d => {
              const r = rows[d.dow]
              return (
                <tr key={d.dow}>
                  <td style={S.td}>
                    <input type="checkbox" checked={r.enabled}
                           onChange={e => updateRow(d.dow, { enabled: e.target.checked })} />
                  </td>
                  <td style={{ ...S.td, fontWeight: '600' }}>{d.name}</td>
                  <td style={S.td}>
                    <input type="time" step="3600" value={r.start} disabled={!r.enabled}
                           onChange={e => updateRow(d.dow, { start: e.target.value })} style={S.input} />
                  </td>
                  <td style={S.td}>
                    <input type="time" step="3600" value={r.end} disabled={!r.enabled}
                           onChange={e => updateRow(d.dow, { end: e.target.value })} style={S.input} />
                  </td>
                  <td style={S.td}>
                    <select value={r.dur} disabled={!r.enabled}
                            onChange={e => updateRow(d.dow, { dur: Number(e.target.value) })} style={S.select}>
                      {DURATIONS.map(m => <option key={m} value={m}>{m} min</option>)}
                    </select>
                  </td>
                  <td style={S.td}>
                    <input type="time" step="3600" value={r.bStart} disabled={!r.enabled}
                           onChange={e => updateRow(d.dow, { bStart: e.target.value })} style={S.input} />
                  </td>
                  <td style={S.td}>
                    <input type="time" step="3600" value={r.bEnd} disabled={!r.enabled}
                           onChange={e => updateRow(d.dow, { bEnd: e.target.value })} style={S.input} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {error && <div style={S.err}>{error}</div>}
        {success && <div style={S.ok}>{success}</div>}
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
          <button style={S.btn('#0891b2')} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save schedule'}</button>
          <button style={S.ghost} onClick={load}>Reload</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.h2}>Overrides (leave / modified hours)</div>
        {overrides.length === 0 ? (
          <p style={S.empty}>No upcoming overrides.</p>
        ) : overrides.map(o => (
          <div key={o.override_id} style={S.ovRow}>
            <div>
              <strong>{o.override_date}</strong>
              {' — '}
              {o.is_available
                ? <>Custom hours {toHHMM(o.start_time)}–{toHHMM(o.end_time)}</>
                : <>Day off</>}
              {o.reason && <span style={{ color: '#6b7280' }}> · {o.reason}</span>}
            </div>
            <button style={S.ghost} onClick={() => removeOverride(o.override_id)}>Remove</button>
          </div>
        ))}

        <div style={S.formRow}>
          <input type="date" value={ovDate} min={new Date().toISOString().slice(0, 10)}
                 onChange={e => setOvDate(e.target.value)} style={S.input} />
          <select value={ovType} onChange={e => setOvType(e.target.value)} style={S.select}>
            <option value="off">Day off</option>
            <option value="custom">Custom hours</option>
          </select>
          {ovType === 'custom' ? (
            <span style={{ display: 'flex', gap: '6px' }}>
              <input type="time" step="3600" value={ovStart} onChange={e => setOvStart(e.target.value)} style={S.input} />
              <input type="time" step="3600" value={ovEnd}   onChange={e => setOvEnd(e.target.value)} style={S.input} />
            </span>
          ) : <span />}
          <button style={S.btn('#4f46e5')} onClick={addOverride}>+ Add</button>
        </div>
        <input value={ovReason} onChange={e => setOvReason(e.target.value)}
               placeholder="Reason (optional)" style={{ ...S.input, width: '100%', marginTop: '8px' }} />
      </div>
    </>
  )
}
