import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ImportReadings } from './ImportReadings'

const preview = {
  rows: [{ row: 2, date: '2026-06-28', status: 'ok', message: null }],
  items: [
    { row: 2, date: '2026-06-28', type: 'weight', label: 'Weight', incoming_value: '80.9', existing_value: null, status: 'ready', error: null, overwrite: false, conflict: false },
    { row: 2, date: '2026-06-28', type: 'oxygen', label: 'Oxygen', incoming_value: '97', existing_value: '96', status: 'conflict', error: null, overwrite: false, conflict: true },
    { row: 2, date: '2026-06-28', type: 'walk_distance', label: 'Walk distance', incoming_value: '', existing_value: null, status: 'skipped', error: null, overwrite: false, conflict: false },
    { row: 3, date: '2026-07-09', type: 'nyha', label: 'NYHA', incoming_value: '3.5', existing_value: null, status: 'error', error: 'NYHA class must be between 1 and 4', overwrite: false, conflict: false },
  ],
  summary: { total_rows: 2, importable: 1, conflicts: 1, errors: 1, skipped: 1, imported: 0 },
}

const rowErrorPreview = {
  rows: [{ row: 4, date: null, status: 'error', message: 'Invalid date "not-a-date"' }],
  items: [],
  summary: { total_rows: 1, importable: 0, conflicts: 0, errors: 1, skipped: 0, imported: 0 },
}

describe('ImportReadings', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('previews pasted readings and shows conflicts and errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => preview })
    vi.stubGlobal('fetch', fetchMock)

    render(<ImportReadings accessToken="token" />)
    fireEvent.change(screen.getByLabelText('Paste readings'), { target: { value: 'Date\tColumn 2\n28/06/2026\t80.9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }))

    expect(await screen.findByText('Row 2: 2026-06-28')).toBeInTheDocument()
    expect(screen.getByText('Weight')).toBeInTheDocument()
    expect(screen.getByText('80.9')).toBeInTheDocument()
    expect(screen.getByText('Conflict: existing 96')).toBeInTheDocument()
    expect(screen.getByText('Skipped blank field')).toBeInTheDocument()
    expect(screen.getByText('NYHA class must be between 1 and 4')).toBeInTheDocument()
  })

  it('shows row-level preview errors when there are no importable items', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => rowErrorPreview })
    vi.stubGlobal('fetch', fetchMock)

    render(<ImportReadings accessToken="token" />)
    fireEvent.change(screen.getByLabelText('Paste readings'), { target: { value: 'Date\tWeight\nnot-a-date\t80.9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }))

    expect(await screen.findByText('Row 4')).toBeInTheDocument()
    expect(screen.getByText('Invalid date "not-a-date"')).toBeInTheDocument()
  })

  it('applies selected overwrite decisions', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => preview })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [], summary: { total_rows: 0, importable: 0, conflicts: 0, errors: 0, skipped: 1, imported: 1 } }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<ImportReadings accessToken="token" />)
    fireEvent.change(screen.getByLabelText('Paste readings'), { target: { value: 'Date\tColumn 2\n28/06/2026\t80.9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }))
    fireEvent.click(await screen.findByLabelText('Overwrite Oxygen on 2026-06-28'))
    fireEvent.click(screen.getByRole('button', { name: 'Import readings' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith('/api/import/observations/apply', expect.objectContaining({
        body: expect.stringContaining('"overwrite":true'),
      }))
    })
    expect(await screen.findByText('Imported 1 readings. Skipped 1. Errors 0.')).toBeInTheDocument()
  })
})
