import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Daily } from './Daily'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    accessToken: 'token',
    status: 'authenticated',
    username: 'simon',
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

function mockDailyFetch() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      date: '2026-07-19',
      observations: {
        weight: { type: 'weight', value: '92.3', metadata: null, updated_at: '2026-07-19T08:00:00Z' },
        bp: { type: 'bp', value: '121/78', metadata: null, updated_at: '2026-07-19T08:00:00Z' },
        symptoms: { type: 'symptoms', value: ['good_day'], metadata: null, updated_at: '2026-07-19T08:00:00Z' },
      },
      checklist: [
        { type: 'weight', label: 'Weight', recorded: true },
        { type: 'pulse', label: 'Pulse', recorded: false },
        { type: 'bp', label: 'Blood pressure', recorded: true },
        { type: 'walk_distance', label: 'Walk', recorded: false },
      ],
    }),
  }))
}

describe('Daily', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })

  it('renders the daily observations form as a checklist-led stacked page', async () => {
    mockDailyFetch()

    render(<Daily />)

    expect(await screen.findByRole('heading', { name: "Today's Recovery" })).toHaveClass('page-title')
    expect(screen.getByText('Record the observations that show how Simon is doing today. Each field saves automatically.')).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveClass('page-shell')

    const checklist = screen.getByRole('navigation', { name: 'Daily checklist' })
    expect(checklist).toHaveClass('grid gap-3 sm:grid-cols-2 lg:grid-cols-4')
    expect(within(checklist).getByRole('button', { name: 'Weight' })).toHaveClass('border-emerald-200 bg-emerald-50 text-emerald-900')
    expect(within(checklist).getByRole('button', { name: 'Pulse' })).toHaveClass('border-slate-200 bg-white text-slate-600')

    expect(screen.getByRole('heading', { name: 'Vitals' }).closest('section')).toHaveClass('section-card')
    expect(screen.getByRole('heading', { name: 'Walk' }).closest('section')).toHaveClass('section-card')
    expect(screen.getByRole('heading', { name: 'Symptoms' }).closest('section')).toHaveClass('section-card')

    expect(screen.getByLabelText('Weight (kg)')).toHaveClass('input-control')
    expect(screen.getByLabelText('Pulse (BPM)')).toHaveClass('input-control')
    expect(screen.getByLabelText('SYS')).toHaveClass('input-control')
    expect(screen.getByLabelText('DIA')).toHaveClass('input-control')
    expect(screen.getByLabelText('Distance (m)')).toHaveClass('input-control')
    expect(screen.getByLabelText('Time (seconds)')).toHaveClass('input-control')
    expect(screen.getByLabelText('Stops')).toHaveClass('input-control')
    expect(screen.getByLabelText('Guitar songs')).toHaveClass('input-control')
    expect(screen.getByLabelText('Notes')).toHaveClass('input-control min-h-36 resize-y')
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
  })
})
