import { AuthProvider, useAuth } from './auth/AuthContext'
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

  const showDashboard = window.location.pathname === '/dashboard'

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', margin: '1rem 2rem', fontFamily: 'system-ui, sans-serif' }}>
        <strong>Simonizer</strong>
        <nav style={{ display: 'flex', gap: '1rem' }} aria-label="Main navigation">
          <a href="/dashboard">Dashboard</a>
          <a href="/">Today</a>
        </nav>
        <button type="button" onClick={() => void auth.logout()}>Log out</button>
      </header>
      {showDashboard ? <Dashboard accessToken={auth.accessToken ?? ''} /> : <Daily />}
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
