import { handleUnauthorized } from './auth'

export type AdvisoryStatus = 'green' | 'amber' | 'red'

export type TrendPoint = {
  date: string
  value: number
}

export type DashboardResponse = {
  today: {
    date: string
    weight: number | null
    pulse: number | null
    bp: string | null
    walk_distance: number | null
    songs: number | null
    nyha: number | null
  }
  trends: {
    weight_7d: TrendPoint[]
    pulse_7d: TrendPoint[]
    walk_7d: TrendPoint[]
  }
  advisory: {
    status: AdvisoryStatus
    messages: string[]
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized()
    }
    throw new Error(String(response.status))
  }
  return response.json() as Promise<T>
}

export async function getDashboard(accessToken: string): Promise<DashboardResponse> {
  const response = await fetch('/api/dashboard', {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  return parseJson<DashboardResponse>(response)
}
