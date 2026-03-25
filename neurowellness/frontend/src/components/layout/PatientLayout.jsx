import Navbar from './Navbar'

export default function PatientLayout({ children }) {
  return (
    <div>
      <Navbar />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
        {children}
      </main>
    </div>
  )
}
