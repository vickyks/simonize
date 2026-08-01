import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

const authState = vi.hoisted(() => ({
  status: 'authenticated' as 'loading' | 'authenticated' | 'anonymous',
}))

vi.mock('./auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    accessToken: 'token',
    status: authState.status,
    username: 'simon',
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('./pages/Dashboard', () => ({
  Dashboard: () => <main><h1>Dashboard route</h1></main>,
}))

vi.mock('./pages/Daily', () => ({
  Daily: () => <main><h1>Add Readings route</h1></main>,
}))

vi.mock('./pages/Charts', () => ({
  Charts: () => <main><h1>Charts route</h1></main>,
}))

vi.mock('./pages/Doctor', () => ({
  Doctor: () => <main><h1>Doctor route</h1></main>,
}))

vi.mock('./pages/Targets', () => ({
  Targets: () => <main><h1>Targets route</h1></main>,
}))

describe('App routing', () => {
  afterEach(() => {
    cleanup()
    authState.status = 'authenticated'
    window.history.replaceState(null, '', '/')
  })

  it('renders auth restore loading state inside a clinical card', () => {
    authState.status = 'loading'

    render(<App />)

    const loading = screen.getByText('Loading...')
    expect(loading.closest('main')).toHaveClass('bg-clinical-page')
    expect(loading.closest('section')).toHaveClass('section-card')
  })

  it('renders dashboard at /dashboard', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Dashboard route' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('banner').parentElement).toHaveClass('app-shell')
  })

  it('redirects authenticated /login visits to /dashboard', () => {
    window.history.replaceState(null, '', '/login')
    const replaceState = vi.spyOn(window.history, 'replaceState')

    render(<App />)

    expect(replaceState).toHaveBeenCalledWith(null, '', '/dashboard')
    expect(window.location.pathname).toBe('/dashboard')
    expect(screen.getByRole('heading', { name: 'Dashboard route' })).toBeInTheDocument()
  })

  it('renders add readings at /', () => {
    window.history.replaceState(null, '', '/')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Add Readings route' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add Readings' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows an Add Readings navigation link', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<App />)

    expect(screen.getByRole('link', { name: 'Add Readings' })).toHaveAttribute('href', '/')
  })

  it('renders charts at /charts', () => {
    window.history.replaceState(null, '', '/charts')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Charts route' })).toBeInTheDocument()
  })

  it('renders doctor at /doctor', () => {
    window.history.replaceState(null, '', '/doctor')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Doctor route' })).toBeInTheDocument()
  })

  it('renders targets at /targets', () => {
    window.history.replaceState(null, '', '/targets')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Targets route' })).toBeInTheDocument()
  })

  it('shows a Charts navigation link', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<App />)

    expect(screen.getByRole('link', { name: 'Charts' })).toHaveAttribute('href', '/charts')
  })

  it('shows a Doctor navigation link', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<App />)

    expect(screen.getByRole('link', { name: 'Doctor' })).toHaveAttribute('href', '/doctor')
  })

  it('shows a Targets navigation link', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<App />)

    expect(screen.getByRole('link', { name: 'Targets' })).toHaveAttribute('href', '/targets')
  })
})
