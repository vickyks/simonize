import { AuthProvider, useAuth } from './auth/AuthContext'
import { Charts } from './pages/Charts'
import { Dashboard } from './pages/Dashboard'
import { Daily } from './pages/Daily'
import { Login } from './pages/Login'

function AppContent() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return <p>Loading...</p>
  }

  if (auth.status === 'anonymous') {
    return <Login />
  }

  if (window.location.pathname === '/login') {
    window.history.replaceState(null, '', '/dashboard')
  }

  const pathname = window.location.pathname
  const showDashboard = pathname === '/dashboard'
  const showCharts = pathname === '/charts'

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', margin: '1rem 2rem', fontFamily: 'system-ui, sans-serif' }}>
        <strong>Simonizer</strong>
        <nav style={{ display: 'flex', gap: '1rem' }} aria-label="Main navigation">
          <a href="/dashboard">Dashboard</a>
          <a href="/">Today</a>
          <a href="/charts">Charts</a>
        </nav>
        <button type="button" onClick={() => void auth.logout()}>Log out</button>
      </header>
      {showDashboard ? <Dashboard accessToken={auth.accessToken ?? ''} /> : null}
      {showCharts ? <Charts accessToken={auth.accessToken ?? ''} /> : null}
      {!showDashboard && !showCharts ? <Daily /> : null}
    </>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
