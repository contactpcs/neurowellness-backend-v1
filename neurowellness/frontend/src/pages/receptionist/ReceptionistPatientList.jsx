import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../lib/api'
import StaffLayout from '../../components/layout/StaffLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const S = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827' },
  search: { border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 14px', fontSize: '14px', outline: 'none', width: '260px' },
  card: { background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '12px 16px', background: '#f9fafb', color: '#6b7280', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '12px 16px', borderBottom: '1px solid #f3f4f6', color: '#374151', verticalAlign: 'middle' },
  viewBtn: { color: '#4f46e5', fontWeight: '600', fontSize: '13px' },
  avatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#059669', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', marginRight: '10px' },
}

export default function ReceptionistPatientList() {
  const [patients, setPatients] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/staff/patients?limit=100')
      .then(r => setPatients(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = patients.filter(p =>
    (p.profiles?.full_name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <StaffLayout>
      <div style={S.header}>
        <h1 style={S.h1}>All Patients ({patients.length})</h1>
        <input
          style={S.search}
          placeholder="Search patients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? <LoadingSpinner /> : (
        <div style={S.card}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Patient</th>
                <th style={S.th}>Joined</th>
                <th style={S.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!filtered.length ? (
                <tr><td colSpan={3} style={{ ...S.td, textAlign: 'center', color: '#9ca3af' }}>No patients found</td></tr>
              ) : filtered.map(p => {
                const prof = p.profiles || {}
                const initials = (prof.full_name || 'P').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <tr key={p.id}>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={S.avatar}>{initials}</span>
                        <div>
                          <div style={{ fontWeight: '600' }}>{prof.full_name || 'Unknown'}</div>
                          <div style={{ fontSize: '12px', color: '#9ca3af' }}>{prof.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={S.td}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                    <td style={S.td}>
                      <Link to={`/receptionist/patients/${p.id}`} style={S.viewBtn}>View</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </StaffLayout>
  )
}
