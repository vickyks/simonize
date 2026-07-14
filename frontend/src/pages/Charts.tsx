import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import * as chartsApi from '../api/charts'
import type { BloodPressurePoint, ChartPoint, ChartRange, ChartsData } from '../api/charts'

type ChartsProps = {
  accessToken: string
}

const EMPTY_TEXT = 'No data yet — start recording to see your progress'
const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All time' },
]

const NYHA_COLOURS: Record<number, string> = {
  1: '#22c55e',
  2: '#eab308',
  3: '#f97316',
  4: '#ef4444',
}
const NO_DATA_COLOUR = '#e5e7eb'

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function isoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function todayIso() {
  return isoDate(new Date())
}

function nyhaLabel(value: number) {
  return { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }[value] ?? String(value)
}

function ChartCard({ title, children, empty }: { title: string; children: ReactNode; empty: boolean }) {
  return (
    <section style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '1rem', padding: '1rem', minHeight: '18rem' }}>
      <h2>{title}</h2>
      {empty ? <p>{EMPTY_TEXT}</p> : children}
    </section>
  )
}

function MetricLineChart({ data, unit }: { data: ChartPoint[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip formatter={(value) => [`${value} ${unit}`, unit]} />
        <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  )
}

function MetricBarChart({ data, unit }: { data: ChartPoint[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip formatter={(value) => [`${value} ${unit}`, unit]} />
        <Bar dataKey="value" fill="#16a34a" />
      </BarChart>
    </ResponsiveContainer>
  )
}

function BloodPressureChart({ data }: { data: BloodPressurePoint[] }) {
  return (
    <>
      <p>Systolic</p>
      <p>Diastolic</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line name="Systolic" type="monotone" dataKey="systolic" stroke="#dc2626" strokeWidth={2} dot />
          <Line name="Diastolic" type="monotone" dataKey="diastolic" stroke="#2563eb" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

export function NyhaCalendar({ points, today = todayIso() }: { points: ChartPoint[]; today?: string }) {
  const pointMap = new Map(points.map((point) => [point.date, point.value]))
  const todayDate = new Date(`${today}T00:00:00`)
  const earliestData = points.length > 0 ? new Date(`${points[0].date}T00:00:00`) : todayDate
  const minimumStart = new Date(todayDate)
  minimumStart.setDate(todayDate.getDate() - (12 * 7 - 1))
  const start = earliestData < minimumStart ? earliestData : minimumStart
  start.setDate(start.getDate() - start.getDay())

  const days: Date[] = []
  for (const day = new Date(start); day <= todayDate; day.setDate(day.getDate() + 1)) {
    days.push(new Date(day))
  }

  return (
    <section style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '1rem', padding: '1rem' }}>
      <h2>NYHA Calendar</h2>
      <div style={{ display: 'grid', gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, 1rem)', gap: '0.25rem', overflowX: 'auto' }}>
        {days.map((day) => {
          const key = isoDate(day)
          const value = pointMap.get(key)
          const label = value === undefined
            ? `${formatDate(key)}: no NYHA recorded`
            : `${formatDate(key)}: NYHA class ${nyhaLabel(value)}`
          return (
            <div
              aria-label={label}
              key={key}
              role="img"
              style={{ width: '1rem', height: '1rem', borderRadius: '0.2rem', backgroundColor: value === undefined ? NO_DATA_COLOUR : NYHA_COLOURS[value] }}
              title={label}
            />
          )
        })}
      </div>
    </section>
  )
}

export function Charts({ accessToken }: ChartsProps) {
  const [range, setRange] = useState<ChartRange>('30')
  const [charts, setCharts] = useState<ChartsData | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true

    chartsApi.getCharts(accessToken, range)
      .then((data) => {
        if (!active) return
        setCharts(data)
        setLoadError(false)
      })
      .catch((error: Error) => {
        if (!active) return
        if (error.message !== '401') setLoadError(true)
      })

    return () => {
      active = false
    }
  }, [accessToken, range])

  if (loadError) return <main><h1>Could not load charts</h1><p>Please try again.</p></main>
  if (!charts) return <p>Loading...</p>

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem', display: 'grid', gap: '1.5rem' }}>
      <section>
        <h1>Charts</h1>
        <p>Long-term recovery trends from Simon's recorded observations.</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {RANGE_OPTIONS.map((option) => (
            <button
              aria-pressed={range === option.value}
              key={option.value}
              onClick={() => setRange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))', gap: '1rem' }}>
        <ChartCard title="Weight" empty={charts.weight.length === 0}><MetricLineChart data={charts.weight} unit="kg" /></ChartCard>
        <ChartCard title="Pulse" empty={charts.pulse.length === 0}><MetricLineChart data={charts.pulse} unit="bpm" /></ChartCard>
        <ChartCard title="Blood Pressure" empty={charts.bp.length === 0}><BloodPressureChart data={charts.bp} /></ChartCard>
        <ChartCard title="Walk Distance" empty={charts.walk.length === 0}><MetricBarChart data={charts.walk} unit="m" /></ChartCard>
        <ChartCard title="Guitar" empty={charts.songs.length === 0}><MetricBarChart data={charts.songs} unit="songs" /></ChartCard>
      </section>
      <NyhaCalendar points={charts.nyha} />
    </main>
  )
}
