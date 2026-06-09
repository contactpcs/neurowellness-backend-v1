import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import api from '../../lib/api'
import DoctorLayout from '../../components/layout/DoctorLayout'
import PatientLayout from '../../components/layout/PatientLayout'
import StaffLayout from '../../components/layout/StaffLayout'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const S = {
  page: { maxWidth: '760px', margin: '0 auto' },
  h1: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '24px' },
  card: { background: '#fff', borderRadius: '12px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' },
  sectionTitle: { fontSize: '15px', fontWeight: '700', color: '#374151', marginBottom: '18px', paddingBottom: '10px', borderBottom: '1px solid #f3f4f6' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: '600', color: '#374151' },
  input: { padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', color: '#111827', outline: 'none' },
  inputReadOnly: { padding: '9px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px', color: '#6b7280', background: '#f9fafb', cursor: 'not-allowed' },
  select: { padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', color: '#111827', outline: 'none', background: '#fff' },
  hint: { fontSize: '11px', color: '#9ca3af', marginTop: '2px' },
  saveBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  saveBtnDisabled: { background: '#a5b4fc', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', cursor: 'not-allowed', fontSize: '14px', fontWeight: '600' },
  successMsg: { background: '#dcfce7', color: '#16a34a', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '500', marginBottom: '16px' },
  errorMsg: { background: '#fef2f2', color: '#dc2626', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '500', marginBottom: '16px' },
}

function computeAge(dob) {
  if (!dob) return null
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

const GENDER_OPTIONS = ['', 'male', 'female', 'other', 'prefer_not_to_say']
const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']
const MARITAL_OPTIONS = ['', 'single', 'married', 'divorced', 'widowed', 'other']
const ID_TYPES = ['', 'aadhar', 'pan', 'passport', 'voter_id', 'other']

export default function ProfileSettings() {
  const { profile, role, updateProfile } = useAuthStore()

  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!profile) return
    setForm({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      date_of_birth: profile.date_of_birth || '',
      gender: profile.gender || '',
      city: profile.city || '',
      state: profile.state || '',
      country: profile.country || 'India',
      address_line1: profile.address_line1 || '',
      pincode: profile.pincode || '',
      language_pref: profile.language_pref || 'en',
      government_id: profile.government_id || '',
      id_type: profile.id_type || '',
      // patient
      blood_group: profile.blood_group || '',
      allergies: profile.allergies || '',
      emergency_contact: profile.emergency_contact || '',
      occupation: profile.occupation || '',
      marital_status: profile.marital_status || '',
      insurance_provider: profile.insurance_provider || '',
      insurance_policy: profile.insurance_policy || '',
      // doctor
      specialisation: profile.specialisation || profile.specialization || '',
      hospital: profile.hospital || profile.hospital_affiliation || '',
      years_of_experience: profile.years_of_experience || '',
    })
  }, [profile])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const payload = {}
      const fields = ['first_name', 'last_name', 'date_of_birth', 'gender', 'city', 'state', 'country', 'address_line1', 'pincode', 'language_pref', 'government_id', 'id_type']
      fields.forEach(k => { if (form[k] !== '') payload[k] = form[k] })

      if (role === 'patient') {
        const pFields = ['blood_group', 'allergies', 'emergency_contact', 'occupation', 'marital_status', 'insurance_provider', 'insurance_policy']
        pFields.forEach(k => { if (form[k] !== '') payload[k] = form[k] })
      }
      if (role === 'doctor') {
        const dFields = ['specialisation', 'hospital', 'years_of_experience']
        dFields.forEach(k => { if (form[k] !== '' && form[k] !== null) payload[k] = form[k] })
      }

      await updateProfile(payload)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const Layout = role === 'doctor' ? DoctorLayout : role === 'patient' ? PatientLayout : StaffLayout

  if (!form) return <Layout><LoadingSpinner /></Layout>

  const age = computeAge(form.date_of_birth)

  return (
    <Layout>
      <div style={S.page}>
        <h1 style={S.h1}>Profile Settings</h1>

        {success && <div style={S.successMsg}>Profile saved successfully.</div>}
        {error && <div style={S.errorMsg}>{error}</div>}

        {/* Read-only identity */}
        <div style={S.card}>
          <div style={S.sectionTitle}>Account (read-only)</div>
          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>Email</label>
              <input style={S.inputReadOnly} value={profile?.email || ''} readOnly />
            </div>
            <div style={S.field}>
              <label style={S.label}>Mobile</label>
              <input style={S.inputReadOnly} value={profile?.phone || '—'} readOnly />
              <span style={S.hint}>Contact support to change email or mobile.</span>
            </div>
          </div>
        </div>

        {/* Name */}
        <div style={S.card}>
          <div style={S.sectionTitle}>Personal Information</div>
          <div style={{ ...S.grid2, marginBottom: '16px' }}>
            <div style={S.field}>
              <label style={S.label}>First Name</label>
              <input style={S.input} value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="First name" />
            </div>
            <div style={S.field}>
              <label style={S.label}>Last Name</label>
              <input style={S.input} value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Last name" />
            </div>
          </div>

          <div style={{ ...S.grid2, marginBottom: '16px' }}>
            <div style={S.field}>
              <label style={S.label}>Date of Birth</label>
              <input style={S.input} type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
            </div>
            <div style={S.field}>
              <label style={S.label}>Age</label>
              <input style={S.inputReadOnly} value={age !== null ? `${age} years` : '—'} readOnly />
              <span style={S.hint}>Computed from date of birth.</span>
            </div>
          </div>

          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>Gender</label>
              <select style={S.select} value={form.gender} onChange={e => set('gender', e.target.value)}>
                {GENDER_OPTIONS.map(o => <option key={o} value={o}>{o || 'Select...'}</option>)}
              </select>
            </div>
            <div style={S.field}>
              <label style={S.label}>Language Preference</label>
              <input style={S.input} value={form.language_pref} onChange={e => set('language_pref', e.target.value)} placeholder="en" />
            </div>
          </div>
        </div>

        {/* Address */}
        <div style={S.card}>
          <div style={S.sectionTitle}>Address</div>
          <div style={{ ...S.field, marginBottom: '16px' }}>
            <label style={S.label}>Address Line</label>
            <input style={S.input} value={form.address_line1} onChange={e => set('address_line1', e.target.value)} placeholder="Street / Flat / Building" />
          </div>
          <div style={{ ...S.grid2, marginBottom: '16px' }}>
            <div style={S.field}>
              <label style={S.label}>City</label>
              <input style={S.input} value={form.city} onChange={e => set('city', e.target.value)} placeholder="City" />
            </div>
            <div style={S.field}>
              <label style={S.label}>State</label>
              <input style={S.input} value={form.state} onChange={e => set('state', e.target.value)} placeholder="State" />
            </div>
          </div>
          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>Pincode</label>
              <input style={S.input} value={form.pincode} onChange={e => set('pincode', e.target.value)} placeholder="6-digit pincode" maxLength={6} />
            </div>
            <div style={S.field}>
              <label style={S.label}>Country</label>
              <input style={S.input} value={form.country} onChange={e => set('country', e.target.value)} placeholder="Country" />
            </div>
          </div>
        </div>

        {/* Government ID */}
        <div style={S.card}>
          <div style={S.sectionTitle}>Identity Document</div>
          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>ID Type</label>
              <select style={S.select} value={form.id_type} onChange={e => set('id_type', e.target.value)}>
                {ID_TYPES.map(o => <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : 'Select...'}</option>)}
              </select>
            </div>
            <div style={S.field}>
              <label style={S.label}>ID Number</label>
              <input style={S.input} value={form.government_id} onChange={e => set('government_id', e.target.value)} placeholder="Enter ID number" />
            </div>
          </div>
        </div>

        {/* Patient-only */}
        {role === 'patient' && (
          <div style={S.card}>
            <div style={S.sectionTitle}>Medical Information</div>
            <div style={{ ...S.grid2, marginBottom: '16px' }}>
              <div style={S.field}>
                <label style={S.label}>Blood Group</label>
                <select style={S.select} value={form.blood_group} onChange={e => set('blood_group', e.target.value)}>
                  {BLOOD_GROUPS.map(o => <option key={o} value={o}>{o || 'Select...'}</option>)}
                </select>
              </div>
              <div style={S.field}>
                <label style={S.label}>Marital Status</label>
                <select style={S.select} value={form.marital_status} onChange={e => set('marital_status', e.target.value)}>
                  {MARITAL_OPTIONS.map(o => <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : 'Select...'}</option>)}
                </select>
              </div>
            </div>
            <div style={{ ...S.field, marginBottom: '16px' }}>
              <label style={S.label}>Allergies</label>
              <input style={S.input} value={form.allergies} onChange={e => set('allergies', e.target.value)} placeholder="e.g. Penicillin, Peanuts" />
            </div>
            <div style={{ ...S.grid2, marginBottom: '16px' }}>
              <div style={S.field}>
                <label style={S.label}>Occupation</label>
                <input style={S.input} value={form.occupation} onChange={e => set('occupation', e.target.value)} placeholder="Occupation" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Emergency Contact</label>
                <input style={S.input} value={form.emergency_contact} onChange={e => set('emergency_contact', e.target.value)} placeholder="Name & phone number" />
              </div>
            </div>
            <div style={S.grid2}>
              <div style={S.field}>
                <label style={S.label}>Insurance Provider</label>
                <input style={S.input} value={form.insurance_provider} onChange={e => set('insurance_provider', e.target.value)} placeholder="Provider name" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Insurance Policy No.</label>
                <input style={S.input} value={form.insurance_policy} onChange={e => set('insurance_policy', e.target.value)} placeholder="Policy number" />
              </div>
            </div>
          </div>
        )}

        {/* Doctor-only */}
        {role === 'doctor' && (
          <div style={S.card}>
            <div style={S.sectionTitle}>Professional Information</div>
            <div style={{ ...S.grid2, marginBottom: '16px' }}>
              <div style={S.field}>
                <label style={S.label}>Specialisation</label>
                <input style={S.input} value={form.specialisation} onChange={e => set('specialisation', e.target.value)} placeholder="e.g. Psychiatry" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Hospital / Clinic</label>
                <input style={S.input} value={form.hospital} onChange={e => set('hospital', e.target.value)} placeholder="Hospital name" />
              </div>
            </div>
            <div style={{ maxWidth: '200px' }}>
              <div style={S.field}>
                <label style={S.label}>Years of Experience</label>
                <input style={S.input} type="number" min="0" max="60" value={form.years_of_experience} onChange={e => set('years_of_experience', e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: '32px' }}>
          <button style={saving ? S.saveBtnDisabled : S.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Layout>
  )
}
