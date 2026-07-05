import { AuthProvider, useAuth } from './auth/AuthContext'
import { Login } from './pages/Login'

function AppContent() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return <p>Loading...</p>
  }

  if (auth.status === 'anonymous' || window.location.pathname === '/login') {
    return <Login />
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h1>Simonizer</h1>
          <p>Signed in as {auth.username}</p>
        </div>
        <button type="button" onClick={() => void auth.logout()}>
          Log out
        </button>
      </header>
    </main>
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
