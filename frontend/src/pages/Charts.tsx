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
import { classes, EmptyState, PageHeader, PageShell, SectionCard } from '../components/ui/PageShell'

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
    <SectionCard className="grid min-h-72 gap-4">
      <h2 className="section-title">{title}</h2>
      {empty ? <EmptyState>{EMPTY_TEXT}</EmptyState> : children}
    </SectionCard>
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
    <SectionCard>
      <h2 className="section-title">NYHA Calendar</h2>
      <div className="mt-4 grid auto-cols-max grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-2">
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
              className="h-4 w-4 rounded"
              style={{ backgroundColor: value === undefined ? NO_DATA_COLOUR : NYHA_COLOURS[value] }}
              title={label}
            />
          )
        })}
      </div>
    </SectionCard>
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

  if (loadError) return <PageShell><PageHeader title="Could not load charts"><p>Please try again.</p></PageHeader></PageShell>
  if (!charts) return <p>Loading...</p>

  return (
    <PageShell>
      <PageHeader title="Charts">
        <p>Long-term recovery trends from Simon's recorded observations.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              aria-pressed={range === option.value}
              className={classes('btn-secondary', range === option.value && 'border-blue-600 bg-blue-50 text-blue-800')}
              key={option.value}
              onClick={() => setRange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </PageHeader>
      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Weight" empty={charts.weight.length === 0}><MetricLineChart data={charts.weight} unit="kg" /></ChartCard>
        <ChartCard title="Pulse" empty={charts.pulse.length === 0}><MetricLineChart data={charts.pulse} unit="bpm" /></ChartCard>
        <ChartCard title="Blood Pressure" empty={charts.bp.length === 0}><BloodPressureChart data={charts.bp} /></ChartCard>
        <ChartCard title="Walk Distance" empty={charts.walk.length === 0}><MetricBarChart data={charts.walk} unit="m" /></ChartCard>
        <ChartCard title="Guitar" empty={charts.songs.length === 0}><MetricBarChart data={charts.songs} unit="songs" /></ChartCard>
      </section>
      <NyhaCalendar points={charts.nyha} />
    </PageShell>
  )
}
