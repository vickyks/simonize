import { AuthProvider, useAuth } from './auth/AuthContext'
import { Charts } from './pages/Charts'
import { Dashboard } from './pages/Dashboard'
import { Daily } from './pages/Daily'
import { Doctor } from './pages/Doctor'
import { Login } from './pages/Login'
import { classes } from './components/ui/PageShell'

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
  const showDoctor = pathname === '/doctor'

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', active: showDashboard },
    { href: '/', label: 'Today', active: !showDashboard && !showCharts && !showDoctor },
    { href: '/charts', label: 'Charts', active: showCharts },
    { href: '/doctor', label: 'Doctor', active: showDoctor },
  ]

  return (
    <div className="app-shell">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <a className="text-2xl font-bold tracking-tight text-clinical-primaryDark no-underline" href="/dashboard">
            Simonizer
          </a>
          <nav className="flex flex-wrap gap-2" aria-label="Main navigation">
            {navItems.map((item) => (
              <a
                className={classes(
                  'rounded-full px-3 py-2 text-base font-semibold no-underline transition',
                  item.active ? 'bg-blue-50 text-clinical-primaryDark' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
                href={item.href}
                key={item.href}
                aria-current={item.active ? 'page' : undefined}
              >
                {item.label}
              </a>
            ))}
        </nav>
          <button className="btn-secondary self-start lg:self-auto" type="button" onClick={() => void auth.logout()}>
            Log out
          </button>
        </div>
      </header>
      {showDashboard ? <Dashboard accessToken={auth.accessToken ?? ''} /> : null}
      {showCharts ? <Charts accessToken={auth.accessToken ?? ''} /> : null}
      {showDoctor ? <Doctor accessToken={auth.accessToken ?? ''} /> : null}
      {!showDashboard && !showCharts && !showDoctor ? <Daily /> : null}
    </div>
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
