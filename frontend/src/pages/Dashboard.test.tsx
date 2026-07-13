import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from './Dashboard'

function mockFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }))
}

function renderDashboard() {
  render(<Dashboard accessToken="token" />)
}

describe('Dashboard', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders summary cards and green advisory from the API response', async () => {
    mockFetch({
      today: {
        date: '2026-07-13',
        weight: 92.3,
        pulse: 71,
        bp: '121/78',
        walk_distance: 325,
        songs: 3,
        nyha: 3,
      },
      trends: {
        weight_7d: [{ date: '2026-07-13', value: 92.3 }],
        pulse_7d: [{ date: '2026-07-13', value: 71 }],
        walk_7d: [{ date: '2026-07-13', value: 325 }],
      },
      advisory: { status: 'green', messages: [] },
    })

    renderDashboard()

    expect(await screen.findByRole('heading', { name: "Simon's Dashboard" })).toBeInTheDocument()
    expect(screen.getByText('92.3 kg')).toBeInTheDocument()
    expect(screen.getByText('71 bpm')).toBeInTheDocument()
    expect(screen.getByText('121/78')).toBeInTheDocument()
    expect(screen.getByText('325 m')).toBeInTheDocument()
    expect(screen.getByText('3 songs')).toBeInTheDocument()
    expect(screen.getByText('Class 3')).toBeInTheDocument()
    expect(screen.getByText('No current concerns from recorded observations.')).toBeInTheDocument()
  })

  it('renders calm empty states for missing values', async () => {
    mockFetch({
      today: {
        date: '2026-07-13',
        weight: null,
        pulse: null,
        bp: null,
        walk_distance: null,
        songs: null,
        nyha: null,
      },
      trends: { weight_7d: [], pulse_7d: [], walk_7d: [] },
      advisory: { status: 'green', messages: [] },
    })

    renderDashboard()

    expect(await screen.findByText('No weight recorded today yet')).toBeInTheDocument()
    expect(screen.getByText('No walk recorded today yet')).toBeInTheDocument()
  })

  it('renders amber advisory messages', async () => {
    mockFetch({
      today: {
        date: '2026-07-13',
        weight: 93,
        pulse: null,
        bp: null,
        walk_distance: null,
        songs: null,
        nyha: null,
      },
      trends: { weight_7d: [], pulse_7d: [], walk_7d: [] },
      advisory: {
        status: 'amber',
        messages: [
          'Your weight has increased 2 kg over 3 days.',
          'Consider contacting the Heart Failure team if this continues.',
        ],
      },
    })

    renderDashboard()

    expect(await screen.findByText('Possible concern')).toBeInTheDocument()
    expect(screen.getByText('Your weight has increased 2 kg over 3 days.')).toBeInTheDocument()
  })
})
