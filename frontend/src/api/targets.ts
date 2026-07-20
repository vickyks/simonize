import { handleUnauthorized } from './auth'

export type TargetType = 'walk_distance' | 'songs' | 'nyha'

export type TargetEntry = {
  type: TargetType
  label: string
  value: number
  unit: string
}

export type MilestoneEntry = {
  type: string
  title: string
  date: string
  message: string
  value: string | null
}

export type TargetsResponse = {
  targets: TargetEntry[]
  milestones: MilestoneEntry[]
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized()
    throw new Error(String(response.status))
  }
  return response.json() as Promise<T>
}

export async function getTargets(accessToken: string): Promise<TargetsResponse> {
  const response = await fetch('/api/targets', {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  return parseJson<TargetsResponse>(response)
}

export async function updateTarget(
  accessToken: string,
  type: TargetType,
  value: number | string,
): Promise<TargetsResponse> {
  const response = await fetch(`/api/targets/${type}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ value }),
  })
  return parseJson<TargetsResponse>(response)
}
