import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Charts, NyhaCalendar } from './Charts'

const emptyPayloads: Record<string, unknown> = {
  '/api/charts/weight?days=30': [],
  '/api/charts/pulse?days=30': [],
  '/api/charts/bp?days=30': [],
  '/api/charts/walk?days=30': [],
  '/api/charts/songs?days=30': [],
  '/api/charts/nyha': [],
}

function mockChartFetch(payloads: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    const body = payloads[path] ?? []
    return Promise.resolve({ ok: true, json: async () => body })
  }))
}

describe('Charts', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads chart data with the default 30 day range', async () => {
    mockChartFetch({
      ...emptyPayloads,
      '/api/charts/weight?days=30': [{ date: '2026-07-13', value: 92.3 }],
      '/api/charts/bp?days=30': [{ date: '2026-07-13', systolic: 121, diastolic: 78 }],
    })

    render(<Charts accessToken="token" />)

    expect(await screen.findByRole('heading', { name: 'Charts' })).toBeInTheDocument()
    expect(screen.getByText('Weight')).toBeInTheDocument()
    expect(screen.getByText('Blood Pressure')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/charts/weight?days=30', expect.any(Object))
    expect(fetch).toHaveBeenCalledWith('/api/charts/nyha', expect.any(Object))
  })

  it('changes the standard chart range', async () => {
    mockChartFetch({
      ...emptyPayloads,
      '/api/charts/weight?days=7': [],
      '/api/charts/pulse?days=7': [],
      '/api/charts/bp?days=7': [],
      '/api/charts/walk?days=7': [],
      '/api/charts/songs?days=7': [],
    })

    render(<Charts accessToken="token" />)
    await screen.findByRole('heading', { name: 'Charts' })
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/charts/weight?days=7', expect.any(Object))
    })
  })

  it('renders empty states without crashing', async () => {
    mockChartFetch(emptyPayloads)

    render(<Charts accessToken="token" />)

    expect(await screen.findAllByText('No data yet — start recording to see your progress')).not.toHaveLength(0)
  })

  it('renders blood pressure series labels', async () => {
    mockChartFetch({
      ...emptyPayloads,
      '/api/charts/bp?days=30': [{ date: '2026-07-13', systolic: 121, diastolic: 78 }],
    })

    render(<Charts accessToken="token" />)

    expect(await screen.findByText('Systolic')).toBeInTheDocument()
    expect(screen.getByText('Diastolic')).toBeInTheDocument()
  })
})

describe('NyhaCalendar', () => {
  afterEach(() => cleanup())

  it('maps NYHA values to documented colours and labels', () => {
    render(<NyhaCalendar points={[{ date: '2026-07-13', value: 3 }]} today="2026-07-13" />)

    const recordedCell = screen.getByLabelText('13 July 2026: NYHA class III')
    expect(recordedCell).toHaveStyle({ backgroundColor: '#f97316' })
    expect(screen.getByLabelText('12 July 2026: no NYHA recorded')).toHaveStyle({ backgroundColor: '#e5e7eb' })
  })
})
