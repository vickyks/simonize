import { createContext, ReactNode, useContext, useEffect, useState } from 'react'

import * as authApi from '../api/auth'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

type AuthContextValue = {
  accessToken: string | null
  status: AuthStatus
  username: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      try {
        const token = await authApi.refresh()
        const user = await authApi.getCurrentUser(token.access_token)
        if (!cancelled) {
          setAccessToken(token.access_token)
          setUsername(user.username)
          setStatus('authenticated')
        }
      } catch {
        if (!cancelled) {
          setAccessToken(null)
          setUsername(null)
          setStatus('anonymous')
        }
      }
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogin(usernameValue: string, password: string) {
    const token = await authApi.login(usernameValue, password)
    const user = await authApi.getCurrentUser(token.access_token)
    setAccessToken(token.access_token)
    setUsername(user.username)
    setStatus('authenticated')
  }

  async function handleLogout() {
    await authApi.logout()
    setAccessToken(null)
    setUsername(null)
    setStatus('anonymous')
  }

  return (
    <AuthContext.Provider
      value={{ accessToken, status, username, login: handleLogin, logout: handleLogout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
