import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function deferredResponse(body: unknown) {
  let resolve!: (value: { ok: boolean; json: () => Promise<unknown> }) => void
  const promise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((innerResolve) => {
    resolve = innerResolve
  })

  return {
    promise,
    resolve: () => resolve({ ok: true, json: async () => body }),
  }
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

  it('does not let a slower earlier range overwrite the latest range', async () => {
    const slowSevenDayResponses: Array<ReturnType<typeof deferredResponse>> = []

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const path = String(input)
      const sevenDayBody = path.includes('/weight') ? [{ date: '2026-07-13', value: 92.3 }] : []

      if (path.includes('days=7')) {
        const response = deferredResponse(sevenDayBody)
        slowSevenDayResponses.push(response)
        return response.promise
      }

      return Promise.resolve({ ok: true, json: async () => [] })
    }))

    render(<Charts accessToken="token" />)
    await screen.findByRole('heading', { name: 'Charts' })

    fireEvent.click(screen.getByRole('button', { name: '7 days' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/charts/weight?days=7', expect.any(Object))
    })

    fireEvent.click(screen.getByRole('button', { name: '90 days' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getAllByText('No data yet — start recording to see your progress')).toHaveLength(5)
    })

    await act(async () => {
      slowSevenDayResponses.forEach((response) => response.resolve())
      await Promise.all(slowSevenDayResponses.map((response) => response.promise))
    })

    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('No data yet — start recording to see your progress')).toHaveLength(5)
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
