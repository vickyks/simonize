import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Targets } from './Targets'

const response = {
  targets: [
    { type: 'walk_distance', label: 'Walk distance target', value: 500, unit: 'm' },
    { type: 'songs', label: 'Guitar songs target', value: 5, unit: 'songs' },
    { type: 'nyha', label: 'NYHA target', value: 2, unit: 'class' },
  ],
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

function mockFetchOnce(body: unknown = response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }))
}

describe('Targets', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads targets and milestones', async () => {
    mockFetchOnce()

    render(<Targets accessToken="token" />)

    expect(await screen.findByRole('heading', { name: 'Targets & Milestones' })).toBeInTheDocument()
    expect(screen.getByLabelText('Walk distance target')).toHaveValue(500)
    expect(screen.getByLabelText('Guitar songs target')).toHaveValue(5)
    expect(screen.getByLabelText('NYHA target')).toHaveValue(2)
    expect(screen.getByText('Longest walk')).toBeInTheDocument()
    expect(screen.getByText('You walked 325 metres - your furthest yet.')).toBeInTheDocument()
    expect(screen.getByText('325 m')).toBeInTheDocument()
  })

  it('saves all changed targets and shows saved feedback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({ ok: true, json: async () => response })
    vi.stubGlobal('fetch', fetchMock)

    render(<Targets accessToken="token" />)
    fireEvent.change(await screen.findByLabelText('Walk distance target'), { target: { value: '650' } })
    fireEvent.change(screen.getByLabelText('Guitar songs target'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('NYHA target'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save targets' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/targets/walk_distance', expect.objectContaining({ method: 'PUT' }))
      expect(fetchMock).toHaveBeenCalledWith('/api/targets/songs', expect.objectContaining({ method: 'PUT' }))
      expect(fetchMock).toHaveBeenCalledWith('/api/targets/nyha', expect.objectContaining({ method: 'PUT' }))
    })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('keeps typed values visible when save fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({ ok: false, status: 422 })
    vi.stubGlobal('fetch', fetchMock)

    render(<Targets accessToken="token" />)
    fireEvent.change(await screen.findByLabelText('Walk distance target'), { target: { value: '650' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save targets' }))

    expect(await screen.findByText('Could not save targets - please try again.')).toBeInTheDocument()
    expect(screen.getByLabelText('Walk distance target')).toHaveValue(650)
  })

  it('renders an empty milestone state', async () => {
    mockFetchOnce({ ...response, milestones: [] })

    render(<Targets accessToken="token" />)

    expect(await screen.findByText("Keep recording - milestones will appear here as Simon's recovery builds.")).toBeInTheDocument()
  })
})
