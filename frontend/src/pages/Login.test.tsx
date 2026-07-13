import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Login } from './Login'

const login = vi.fn()

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    accessToken: null,
    status: 'anonymous',
    username: null,
    login,
    logout: vi.fn(),
  }),
}))

describe('Login', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('redirects successful logins to /dashboard', async () => {
    login.mockResolvedValue(undefined)
    const replaceState = vi.spyOn(window.history, 'replaceState')

    render(<Login />)

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'simon' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(login).toHaveBeenCalledWith('simon', 'password'))
    expect(replaceState).toHaveBeenCalledWith(null, '', '/dashboard')
    expect(window.location.pathname).toBe('/dashboard')
  })
})
