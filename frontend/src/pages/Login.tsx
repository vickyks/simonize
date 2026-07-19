import { FormEvent, useState } from 'react'

import { useAuth } from '../auth/AuthContext'

export function Login() {
  const auth = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    try {
      await auth.login(username, password)
      window.history.replaceState(null, '', '/dashboard')
    } catch {
      setError('That username or password did not work.')
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-clinical-page px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
        <p className="page-kicker">Simonizer</p>
        <h1 className="page-title">Welcome back</h1>
        <p className="mt-2 text-lg leading-7 text-clinical-muted">Log in to continue tracking Simon's recovery.</p>
        <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
          <label className="field-label">
            Username
            <input
              autoComplete="username"
              className="input-control"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="field-label">
            Password
            <input
              autoComplete="current-password"
              className="input-control"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900" role="alert">{error}</p> : null}
          <button className="btn-primary w-full" type="submit">Log in</button>
        </form>
      </section>
    </main>
  )
}
