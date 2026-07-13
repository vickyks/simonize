import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

vi.mock('./auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    accessToken: 'token',
    status: 'authenticated',
    username: 'simon',
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('./pages/Dashboard', () => ({
  Dashboard: () => <main><h1>Dashboard route</h1></main>,
}))

vi.mock('./pages/Daily', () => ({
  Daily: () => <main><h1>Daily route</h1></main>,
}))

describe('App routing', () => {
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/')
  })

  it('renders dashboard at /dashboard', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Dashboard route' })).toBeInTheDocument()
  })

  it('renders daily observations at /', () => {
    window.history.replaceState(null, '', '/')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Daily route' })).toBeInTheDocument()
  })
})
