import { handleUnauthorized } from './auth'

export type ChartRange = '7' | '30' | '90' | 'all'

export type ChartPoint = {
  date: string
  value: number
}

export type BloodPressurePoint = {
  date: string
  systolic: number
  diastolic: number
}

export type ChartsData = {
  weight: ChartPoint[]
  pulse: ChartPoint[]
  bp: BloodPressurePoint[]
  walk: ChartPoint[]
  songs: ChartPoint[]
  nyha: ChartPoint[]
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

async function get<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  return parseJson<T>(response)
}

export async function getCharts(
  accessToken: string,
  range: ChartRange,
): Promise<ChartsData> {
  const query = `days=${range}`
  const [weight, pulse, bp, walk, songs, nyha] = await Promise.all([
    get<ChartPoint[]>(`/api/charts/weight?${query}`, accessToken),
    get<ChartPoint[]>(`/api/charts/pulse?${query}`, accessToken),
    get<BloodPressurePoint[]>(`/api/charts/bp?${query}`, accessToken),
    get<ChartPoint[]>(`/api/charts/walk?${query}`, accessToken),
    get<ChartPoint[]>(`/api/charts/songs?${query}`, accessToken),
    get<ChartPoint[]>('/api/charts/nyha', accessToken),
  ])

  return { weight, pulse, bp, walk, songs, nyha }
}
