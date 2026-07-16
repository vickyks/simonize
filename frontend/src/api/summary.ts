import { handleUnauthorized } from './auth'

export type SummaryDays = '7' | '30'

export type SummaryPoint = { date: string; value: number }
export type SummaryBpPoint = { date: string; systolic: number; diastolic: number }
export type SummaryWalkPoint = { date: string; distance: number; time_seconds: number | null; stops: number | null }
export type SummarySymptomsEntry = { date: string; values: string[] }
export type SummaryNoteEntry = { date: string; text: string }

export type SummaryResponse = {
  range: { days: number; start_date: string; end_date: string; generated_at: string }
  vitals: { weight: SummaryPoint[]; pulse: SummaryPoint[]; bp: SummaryBpPoint[] }
  activity: { walk: SummaryWalkPoint[]; songs: SummaryPoint[] }
  functional: { nyha: SummaryPoint[] }
  symptoms: SummarySymptomsEntry[]
  notes: SummaryNoteEntry[]
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized()
    throw new Error(String(response.status))
  }
  return response.json() as Promise<T>
}

export async function getSummary(
  accessToken: string,
  days: SummaryDays,
): Promise<SummaryResponse> {
  const response = await fetch(`/api/summary?days=${days}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  return parseJson<SummaryResponse>(response)
}
