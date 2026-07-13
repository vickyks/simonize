import { AuthProvider, useAuth } from './auth/AuthContext'
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
    window.history.replaceState(null, '', '/')
  }

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', margin: '1rem 2rem', fontFamily: 'system-ui, sans-serif' }}>
        <strong>Simonizer</strong>
        <button type="button" onClick={() => void auth.logout()}>Log out</button>
      </header>
      <Daily />
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
