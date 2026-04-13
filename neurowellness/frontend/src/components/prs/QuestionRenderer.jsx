const inputStyle = {
  border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 12px',
  fontSize: '14px', width: '100%', outline: 'none', boxSizing: 'border-box',
}

export default function QuestionRenderer({ question, value, onChange }) {
  const type = question.question_type || 'likert'

  // Parse options — comes as JSONB array or string
  const options = (() => {
    const raw = question.options
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    try { return JSON.parse(raw) } catch { return [] }
  })()

  // Numeric bounds from question columns
  const minVal = question.min_value ?? 0
  const maxVal = question.max_value
  const stepVal = question.step_value ?? 1

  // ── Radio / Likert / single-choice ────────────────────────────────────────
  if (type === 'radio' || type === 'likert' || type === 'single-choice' || type === 'binary') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {options.map((opt, i) => {
          const optVal = String(opt.value ?? opt.score ?? i)
          const selected = String(value) === optVal
          return (
            <label key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer',
              padding: '10px 14px', borderRadius: '8px', border: '1px solid',
              borderColor: selected ? '#4f46e5' : '#e5e7eb',
              background: selected ? '#eef2ff' : '#fff',
              transition: 'all 0.15s',
            }}>
              <input
                type="radio"
                name={`q_${question.question_index}`}
                value={optVal}
                checked={selected}
                onChange={() => onChange(optVal, opt.label || opt.text || optVal)}
                style={{ marginTop: '2px', accentColor: '#4f46e5' }}
              />
              <div>
                <span style={{ fontSize: '14px' }}>
                  {opt.label || opt.text || optVal}
                </span>
                {opt.description && (
                  <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>
                    {opt.description}
                  </p>
                )}
              </div>
            </label>
          )
        })}
      </div>
    )
  }

  // ── Checkbox (multi-select) ────────────────────────────────────────────────
  if (type === 'checkbox') {
    const selected = Array.isArray(value)
      ? value
      : (value ? String(value).split(',').map(v => v.trim()) : [])

    const toggleOption = (optVal) => {
      const next = selected.includes(optVal)
        ? selected.filter(v => v !== optVal)
        : [...selected, optVal]
      const labels = next.map(v => {
        const o = options.find(o => String(o.value ?? o.score ?? '') === v)
        return o?.label || o?.text || v
      })
      onChange(next.join(','), labels.join(', '))
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {options.map((opt, i) => {
          const optVal = String(opt.value ?? opt.score ?? i)
          const checked = selected.includes(optVal)
          return (
            <label key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer',
              padding: '10px 14px', borderRadius: '8px', border: '1px solid',
              borderColor: checked ? '#4f46e5' : '#e5e7eb',
              background: checked ? '#eef2ff' : '#fff',
              transition: 'all 0.15s',
            }}>
              <input
                type="checkbox"
                value={optVal}
                checked={checked}
                onChange={() => toggleOption(optVal)}
                style={{ marginTop: '2px', accentColor: '#4f46e5' }}
              />
              <span style={{ fontSize: '14px' }}>{opt.label || opt.text || optVal}</span>
            </label>
          )
        })}
      </div>
    )
  }

  // ── Numeric input ──────────────────────────────────────────────────────────
  if (type === 'numeric' || type === 'number' || type === 'integer') {
    return (
      <input
        type="number"
        style={inputStyle}
        min={minVal}
        max={maxVal}
        step={stepVal}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder || `Enter a number${maxVal != null ? ` (${minVal}–${maxVal})` : ''}`}
      />
    )
  }

  // ── Slider ────────────────────────────────────────────────────────────────
  if (type === 'slider') {
    const min = minVal ?? 0
    const max = maxVal ?? 10
    const step = stepVal ?? 1
    return (
      <div>
        <input
          type="range" min={min} max={max} step={step}
          value={value ?? min}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', accentColor: '#4f46e5' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
          <span>{question.left_anchor || min}</span>
          <span style={{ fontWeight: '700', color: '#4f46e5', fontSize: '18px' }}>{value ?? min}</span>
          <span>{question.right_anchor || max}</span>
        </div>
      </div>
    )
  }

  // ── VAS ───────────────────────────────────────────────────────────────────
  if (type === 'visual-analogue-scale' || type === 'vas') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
          <span>{question.left_anchor || '0 (None)'}</span>
          <span style={{ fontWeight: '700', fontSize: '20px', color: '#4f46e5' }}>{value ?? 0}</span>
          <span>{question.right_anchor || '100 (Worst)'}</span>
        </div>
        <input
          type="range" min={0} max={100} step={1}
          value={value ?? 0}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', accentColor: '#4f46e5' }}
        />
      </div>
    )
  }

  // ── Text / textarea ────────────────────────────────────────────────────────
  if (type === 'text' || type === 'textarea') {
    return (
      <textarea
        style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder || 'Enter your response...'}
      />
    )
  }

  // ── Time input ────────────────────────────────────────────────────────────
  if (type === 'time') {
    return (
      <input
        type="time"
        style={inputStyle}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  // ── Fallback text ─────────────────────────────────────────────────────────
  return (
    <input
      type="text"
      style={inputStyle}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={question.placeholder || 'Enter your response...'}
    />
  )
}
