import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Doctor } from './Doctor'

const summary = {
  range: {
    days: 7,
    start_date: '2026-07-07',
    end_date: '2026-07-13',
    generated_at: '2026-07-13T10:30:00Z',
  },
  vitals: {
    weight: [{ date: '2026-07-13', value: 92.3 }],
    pulse: [{ date: '2026-07-13', value: 71 }],
    bp: [{ date: '2026-07-13', systolic: 121, diastolic: 78 }],
  },
  activity: {
    walk: [{ date: '2026-07-13', distance: 325, time_seconds: 840, stops: 2 }],
    songs: [{ date: '2026-07-13', value: 3 }],
  },
  functional: { nyha: [{ date: '2026-07-13', value: 3 }] },
  symptoms: [{ date: '2026-07-13', values: ['breathless', 'good_day'] }],
  notes: [{ date: '2026-07-13', text: 'Felt stronger today' }],
}

function mockSummaryFetch(body: unknown = summary) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }))
}

describe('Doctor', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads the 7 day summary by default and renders sections', async () => {
    mockSummaryFetch()

    render(<Doctor accessToken="token" />)

    expect(await screen.findByRole('heading', { name: 'Doctor Summary' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/summary?days=7', expect.any(Object))
    expect(screen.getByText('Weight')).toBeInTheDocument()
    expect(screen.getByText('Blood Pressure')).toBeInTheDocument()
    expect(screen.getByText('Walk')).toBeInTheDocument()
    expect(screen.getByText('Symptoms')).toBeInTheDocument()
    expect(screen.getByText('Felt stronger today')).toBeInTheDocument()
    expect(screen.getByText('Breathless')).toBeInTheDocument()
    expect(screen.getByText('Good day')).toBeInTheDocument()
  })

  it('changes to the 30 day summary', async () => {
    mockSummaryFetch({ ...summary, range: { ...summary.range, days: 30 } })

    render(<Doctor accessToken="token" />)
    await screen.findByRole('heading', { name: 'Doctor Summary' })
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/summary?days=30', expect.any(Object))
    })
  })

  it('renders print-safe empty states', async () => {
    mockSummaryFetch({
      ...summary,
      vitals: { weight: [], pulse: [], bp: [] },
      activity: { walk: [], songs: [] },
      functional: { nyha: [] },
      symptoms: [],
      notes: [],
    })

    render(<Doctor accessToken="token" />)

    expect(await screen.findAllByText('No data recorded for this period.')).not.toHaveLength(0)
  })

  it('prints the page', async () => {
    mockSummaryFetch()
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)

    render(<Doctor accessToken="token" />)
    await screen.findByRole('heading', { name: 'Doctor Summary' })
    fireEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }))

    expect(print).toHaveBeenCalled()
  })
})
