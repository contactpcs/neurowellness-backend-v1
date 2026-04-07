import Navbar from './Navbar'

export default function StaffLayout({ children }) {
  return (
    <div>
      <Navbar />
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        {children}
      </main>
    </div>
  )
}
