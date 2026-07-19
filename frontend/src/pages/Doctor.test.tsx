import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

    const { container } = render(<Doctor accessToken="token" />)

    expect(await screen.findByRole('heading', { name: 'Doctor Summary' })).toBeInTheDocument()
    expect(container.querySelector('main')).toHaveClass('page-shell', 'doctor-report')
    expect(container.querySelector('style')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Doctor Summary' })).toHaveClass('page-title')
    expect(screen.getByRole('heading', { name: 'Weight' }).closest('section')).toHaveClass('doctor-section', 'section-card')
    expect(screen.getByRole('button', { name: 'Last 7 days' })).toHaveClass('btn-secondary')
    expect(screen.getByRole('button', { name: 'Print / Save as PDF' })).toHaveClass('btn-primary')
    expect(container.querySelector('table')).toHaveClass('table-report')
    expect(fetch).toHaveBeenCalledWith('/api/summary?days=7', expect.any(Object))
    expect(screen.getByText('Weight')).toBeInTheDocument()
    expect(screen.getByText('Blood Pressure')).toBeInTheDocument()
    expect(screen.getByText('Walk')).toBeInTheDocument()
    expect(screen.getByText('Symptoms')).toBeInTheDocument()
    expect(screen.getByText('14 min')).toBeInTheDocument()
    expect(screen.getByText('Felt stronger today')).toBeInTheDocument()
    expect(screen.getByText('Breathless')).toBeInTheDocument()
    expect(screen.getByText('Good day')).toBeInTheDocument()
  })

  it('renders loading state inside the clinical page shell and card', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))

    const { container } = render(<Doctor accessToken="token" />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(container.querySelector('main')).toHaveClass('page-shell', 'doctor-report')
    expect(screen.getByText('Loading...').closest('section')).toHaveClass('section-card')
  })

  it('renders load errors inside the clinical page shell and card', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))

    const { container } = render(<Doctor accessToken="token" />)

    expect(await screen.findByRole('heading', { name: 'Could not load doctor summary' })).toBeInTheDocument()
    expect(container.querySelector('main')).toHaveClass('page-shell', 'doctor-report')
    expect(screen.getByRole('heading', { name: 'Could not load doctor summary' }).closest('section')).toHaveClass('section-card')
  })

  it('wraps doctor tables for narrow screens and long notes', async () => {
    mockSummaryFetch({
      ...summary,
      notes: [{ date: '2026-07-13', text: 'Averylongnotewithoutspacesthatshouldnotforcehorizontalpageoverflow' }],
    })

    render(<Doctor accessToken="token" />)

    const note = await screen.findByText('Averylongnotewithoutspacesthatshouldnotforcehorizontalpageoverflow')
    expect(note.closest('td')).toHaveClass('whitespace-normal', 'break-words')
    for (const table of screen.getAllByRole('table')) {
      expect(table.parentElement).toHaveClass('overflow-x-auto')
    }
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

  it('defines print CSS that forces the doctor report to black on white', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8')

    expect(css).toContain('@media print')
    expect(css).toMatch(/\.doctor-report,\s*\.doctor-report \*/)
    expect(css).toMatch(/\.doctor-section\s*{[^}]*background:\s*#fff !important;[^}]*color:\s*#000 !important;[^}]*box-shadow:\s*none !important;/s)
    expect(css).toMatch(/\.table-report th,\s*\.table-report td\s*{(?=[^}]*background:\s*#fff !important;)(?=[^}]*color:\s*#000 !important;)(?=[^}]*border:\s*1px solid #000 !important;)/s)
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
