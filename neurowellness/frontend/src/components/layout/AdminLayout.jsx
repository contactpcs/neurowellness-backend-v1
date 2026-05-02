import Navbar from './Navbar'

export default function AdminLayout({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <Navbar />
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        {children}
      </main>
    </div>
  )
}
