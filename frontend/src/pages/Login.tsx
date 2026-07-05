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
      window.history.replaceState(null, '', '/')
    } catch {
      setError('That username or password did not work.')
    }
  }

  return (
    <main style={{ maxWidth: '28rem', margin: '4rem auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Welcome back</h1>
      <p>Log in to continue tracking Simon's recovery.</p>
      <form onSubmit={handleSubmit}>
        <label>
          Username
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            style={{ display: 'block', marginBottom: '1rem', width: '100%' }}
          />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{ display: 'block', marginBottom: '1rem', width: '100%' }}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit">Log in</button>
      </form>
    </main>
  )
}
