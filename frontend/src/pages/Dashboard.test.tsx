import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from './Dashboard'

function mockFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }))
}

const dashboard = {
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
  targets: {
    walk_distance: { current: 325, target: 500, met: false, label: '325 m of 500 m' },
    songs: { current: 3, target: 5, met: false, label: '3 of 5 songs' },
    nyha: { current: 3, target: 2, met: false, label: 'Class 3, target Class 2' },
  },
  milestones: [
    {
      type: 'longest_walk',
      title: 'Longest walk',
      date: '2026-07-13',
      message: 'You walked 325 metres - your furthest yet.',
      value: '325 m',
    },
  ],
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
    mockFetch(dashboard)

    const { container } = render(<Dashboard accessToken="token" />)

    expect(await screen.findByRole('heading', { name: "Simon's Dashboard" })).toBeInTheDocument()
    expect(container.querySelector('main')).toHaveClass('page-shell')
    expect(screen.getByRole('heading', { name: "Simon's Dashboard" })).toHaveClass('page-title')
    expect(screen.getByRole('heading', { name: 'Weight' }).closest('article')).toHaveClass('section-card')
    expect(screen.getByRole('link', { name: "Record today's observations" })).toHaveClass('btn-primary')
    expect(screen.getByText('92.3 kg')).toBeInTheDocument()
    expect(screen.getByText('71 bpm')).toBeInTheDocument()
    expect(screen.getByText('121/78')).toBeInTheDocument()
    expect(screen.getAllByText('325 m')[0]).toBeInTheDocument()
    expect(screen.getByText('3 songs')).toBeInTheDocument()
    expect(screen.getByText('Class 3')).toBeInTheDocument()
    expect(screen.getByText('325 m of 500 m')).toBeInTheDocument()
    expect(screen.getByText('3 of 5 songs')).toBeInTheDocument()
    expect(screen.getByText('Class 3, target Class 2')).toBeInTheDocument()
    expect(screen.getByText('Longest walk')).toBeInTheDocument()
    expect(screen.getByText('You walked 325 metres - your furthest yet.')).toBeInTheDocument()
    expect(screen.getByText('No current concerns from recorded observations.')).toBeInTheDocument()
  })

  it('shows an encouraging milestone empty state', async () => {
    mockFetch({ ...dashboard, milestones: [] })

    render(<Dashboard accessToken="token" />)

    expect(await screen.findByText("Keep recording - milestones will appear here as Simon's recovery builds.")).toBeInTheDocument()
  })

  it('renders loading state inside the clinical page shell and card', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))

    const { container } = render(<Dashboard accessToken="token" />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(container.querySelector('main')).toHaveClass('page-shell')
    expect(screen.getByText('Loading...').closest('section')).toHaveClass('section-card')
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
      targets: dashboard.targets,
      milestones: dashboard.milestones,
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
      targets: dashboard.targets,
      milestones: dashboard.milestones,
    })

    renderDashboard()

    expect(await screen.findByText('Possible concern')).toBeInTheDocument()
    expect(screen.getByText('Your weight has increased 2 kg over 3 days.')).toBeInTheDocument()
  })
})
