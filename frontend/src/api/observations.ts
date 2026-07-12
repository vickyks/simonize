export type ObservationType =
  | 'weight'
  | 'pulse'
  | 'bp'
  | 'walk_distance'
  | 'walk_time'
  | 'walk_stops'
  | 'songs'
  | 'nyha'
  | 'symptoms'
  | 'notes'

export type ObservationValue = string | string[]

export type Observation = {
  type: ObservationType
  value: ObservationValue
  metadata: Record<string, unknown> | null
  updated_at: string
}

export type ChecklistItem = {
  type: ObservationType
  label: string
  recorded: boolean
}

export type DailyObservations = {
  date: string
  observations: Partial<Record<ObservationType, Observation>>
  checklist: ChecklistItem[]
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      window.history.replaceState(null, '', '/login')
    }
    throw new Error(String(response.status))
  }
  return response.json() as Promise<T>
}

export async function getDailyObservations(
  date: string,
  accessToken: string,
): Promise<DailyObservations> {
  const response = await fetch(`/api/observations/${date}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  return parseJson<DailyObservations>(response)
}

export async function saveObservation(
  date: string,
  type: ObservationType,
  value: ObservationValue,
  accessToken: string,
  metadata: Record<string, unknown> | null = null,
): Promise<Observation> {
  const response = await fetch(`/api/observations/${date}/${type}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ value, metadata }),
  })
  return parseJson<Observation>(response)
}
