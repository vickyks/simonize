import { handleUnauthorized } from './auth'

export type ImportSummary = {
  total_rows: number
  importable: number
  conflicts: number
  errors: number
  skipped: number
  imported: number
}

export type ImportItem = {
  row: number
  date: string
  type: string
  label: string
  incoming_value: string
  existing_value: string | null
  status: 'ready' | 'conflict' | 'error' | 'skipped' | 'imported'
  error: string | null
  overwrite: boolean
  conflict: boolean
}

export type ImportRow = {
  row: number
  date: string | null
  status: string
  message: string | null
}

export type ImportPreviewResponse = {
  rows: ImportRow[]
  items: ImportItem[]
  summary: ImportSummary
}

export type ImportApplyResponse = {
  items: ImportItem[]
  summary: ImportSummary
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized()
    throw new Error(String(response.status))
  }
  return response.json() as Promise<T>
}

export async function previewReadingsImport(accessToken: string, text: string): Promise<ImportPreviewResponse> {
  const response = await fetch('/api/import/observations/preview', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ text }),
  })
  return parseJson<ImportPreviewResponse>(response)
}

export async function applyReadingsImport(accessToken: string, items: ImportItem[]): Promise<ImportApplyResponse> {
  const response = await fetch('/api/import/observations/apply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ items }),
  })
  return parseJson<ImportApplyResponse>(response)
}
