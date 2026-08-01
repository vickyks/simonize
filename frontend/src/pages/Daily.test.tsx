import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
        oxygen: { type: 'oxygen', value: '97', metadata: null, updated_at: '2026-07-19T08:00:00Z' },
        symptoms: { type: 'symptoms', value: ['good_day'], metadata: null, updated_at: '2026-07-19T08:00:00Z' },
      },
      checklist: [
        { type: 'weight', label: 'Weight', recorded: true },
        { type: 'pulse', label: 'Pulse', recorded: false },
        { type: 'bp', label: 'Blood pressure', recorded: true },
        { type: 'oxygen', label: 'Oxygen', recorded: true },
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

  it('renders the add readings form with a date picker and oxygen input', async () => {
    mockDailyFetch()

    render(<Daily />)

    expect(await screen.findByRole('heading', { name: 'Add Readings' })).toHaveClass('page-title')
    expect(screen.getByText("Record Simon's readings for the selected date. Each field saves automatically.")).toBeInTheDocument()
    expect(screen.getByLabelText('Reading date')).toHaveAttribute('type', 'date')
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/')
    expect(screen.getByLabelText('Oxygen (%)')).toHaveValue('97')
    expect(screen.getByRole('main')).toHaveClass('page-shell')

    const checklist = screen.getByRole('navigation', { name: 'Readings checklist' })
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
    expect(screen.getByLabelText('Time (minutes)')).toHaveClass('input-control')
    expect(screen.getByLabelText('Stops')).toHaveClass('input-control')
    expect(screen.getByLabelText('Guitar songs')).toHaveClass('input-control')
    expect(screen.getByLabelText('Notes')).toHaveClass('input-control min-h-36 resize-y')
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
  })

  it('navigates when the reading date changes', async () => {
    mockDailyFetch()
    window.history.replaceState(null, '', '/')

    render(<Daily />)

    const dateInput = await screen.findByLabelText('Reading date')
    fireEvent.change(dateInput, { target: { value: '2026-07-10' } })

    expect(window.location.pathname).toBe('/2026-07-10')
  })

  it('does not save stale readings while a changed date is loading', async () => {
    let resolveChangedDate: (response: { ok: boolean; json: () => Promise<unknown> }) => void = () => {}
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/observations/2026-07-20') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            date: '2026-07-20',
            observations: {
              oxygen: { type: 'oxygen', value: '97', metadata: null, updated_at: '2026-07-20T08:00:00Z' },
            },
            checklist: [],
          }),
        })
      }
      if (url === '/api/observations/2026-07-21') {
        return new Promise((resolve) => {
          resolveChangedDate = resolve
        })
      }

      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetch)
    window.history.replaceState(null, '', '/2026-07-20')

    render(<Daily />)

    const oxygen = await screen.findByLabelText('Oxygen (%)')
    fireEvent.change(screen.getByLabelText('Reading date'), { target: { value: '2026-07-21' } })
    fireEvent.blur(oxygen)

    expect(fetch).not.toHaveBeenCalledWith('/api/observations/2026-07-21/oxygen', expect.anything())

    resolveChangedDate({
      ok: true,
      json: async () => ({
        date: '2026-07-21',
        observations: {
          oxygen: { type: 'oxygen', value: '98', metadata: null, updated_at: '2026-07-21T08:00:00Z' },
        },
        checklist: [],
      }),
    })

    expect(await screen.findByLabelText('Oxygen (%)')).toHaveValue('98')
  })

  it('saves oxygen readings', async () => {
    const fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith('/oxygen')) {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          date: '2026-07-20',
          observations: {
            oxygen: { type: 'oxygen', value: '97', metadata: null, updated_at: '2026-07-20T08:00:00Z' },
          },
          checklist: [],
        }),
      })
    })
    vi.stubGlobal('fetch', fetch)
    window.history.replaceState(null, '', '/2026-07-20')

    render(<Daily />)

    const oxygen = await screen.findByLabelText('Oxygen (%)')
    fireEvent.change(oxygen, { target: { value: '98' } })
    fireEvent.blur(oxygen)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/observations/2026-07-20/oxygen',
        expect.objectContaining({ body: JSON.stringify({ value: '98', metadata: null }) }),
      )
    })
  })

  it('displays walk time in minutes and saves it as seconds', async () => {
    const fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith('/walk_time')) {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          date: '2026-07-20',
          observations: {
            walk_time: { type: 'walk_time', value: '840', metadata: null, updated_at: '2026-07-20T08:00:00Z' },
          },
          checklist: [],
        }),
      })
    })
    vi.stubGlobal('fetch', fetch)
    window.history.replaceState(null, '', '/2026-07-20')

    render(<Daily />)

    const time = await screen.findByLabelText('Time (minutes)')
    expect(time).toHaveValue('14')

    fireEvent.change(time, { target: { value: '15' } })
    fireEvent.blur(time)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/observations/2026-07-20/walk_time',
        expect.objectContaining({ body: JSON.stringify({ value: '900', metadata: null }) }),
      )
    })
  })
})
