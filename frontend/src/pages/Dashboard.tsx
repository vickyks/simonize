import { useEffect, useState } from 'react'

import * as dashboardApi from '../api/dashboard'
import type { DashboardResponse, TrendPoint } from '../api/dashboard'
import { classes, PageHeader, PageShell, SectionCard } from '../components/ui/PageShell'

type DashboardProps = {
  accessToken: string
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function Sparkline({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return null

  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 100
    const y = 30 - ((point.value - min) / range) * 30
    return `${x},${y}`
  })

  return (
    <svg viewBox="0 0 100 32" role="img" aria-label="7 day trend" className="h-8 w-full">
      <polyline fill="none" stroke="currentColor" strokeWidth="3" points={coordinates.join(' ')} />
    </svg>
  )
}

function SummaryCard({
  title,
  value,
  empty,
  trend,
}: {
  title: string
  value: string | null
  empty: string
  trend?: TrendPoint[]
}) {
  return (
    <article className="section-card grid min-h-40 gap-3">
      <h2 className="text-base font-semibold text-slate-500">{title}</h2>
      <p className={classes('text-3xl font-bold tracking-tight', value ? 'text-clinical-ink' : 'text-slate-400')}>{value ?? empty}</p>
      {trend ? <Sparkline points={trend} /> : null}
    </article>
  )
}

function Advisory({ dashboard }: { dashboard: DashboardResponse }) {
  const status = dashboard.advisory.status
  const styles = {
    green: { label: 'Steady', copy: 'No current concerns from recorded observations.' },
    amber: { label: 'Possible concern', copy: null },
    red: { label: 'Potentially serious', copy: null },
  }[status]

  return (
    <SectionCard className={classes('status-banner', {
      green: 'border-green-300 bg-green-50',
      amber: 'border-amber-400 bg-amber-50',
      red: 'border-red-400 bg-red-50',
    }[status])}>
      <h2 className="text-xl font-bold text-clinical-ink">{styles.label}</h2>
      {styles.copy ? <p>{styles.copy}</p> : null}
      {dashboard.advisory.messages.length > 0 ? (
        <ul>
          {dashboard.advisory.messages.map((message) => <li key={message}>{message}</li>)}
        </ul>
      ) : null}
    </SectionCard>
  )
}

export function Dashboard({ accessToken }: DashboardProps) {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    dashboardApi.getDashboard(accessToken)
      .then((data) => {
        setDashboard(data)
        setLoadError(false)
      })
      .catch((error: Error) => {
        if (error.message !== '401') setLoadError(true)
      })
  }, [accessToken])

  if (loadError) return <PageShell><PageHeader title="Could not load dashboard"><p>Please try again.</p></PageHeader></PageShell>
  if (!dashboard) return <PageShell><SectionCard><p>Loading...</p></SectionCard></PageShell>

  return (
    <PageShell>
      <PageHeader kicker={formatDate(dashboard.today.date)} title="Simon's Dashboard">
        <p>Today's recovery picture, from the observations recorded so far.</p>
      </PageHeader>
      <Advisory dashboard={dashboard} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard title="Weight" value={dashboard.today.weight === null ? null : `${dashboard.today.weight} kg`} empty="No weight recorded today yet" trend={dashboard.trends.weight_7d} />
        <SummaryCard title="Pulse" value={dashboard.today.pulse === null ? null : `${dashboard.today.pulse} bpm`} empty="No pulse recorded today yet" trend={dashboard.trends.pulse_7d} />
        <SummaryCard title="Blood Pressure" value={dashboard.today.bp} empty="No blood pressure recorded today yet" />
        <SummaryCard title="Today's Walk" value={dashboard.today.walk_distance === null ? null : `${dashboard.today.walk_distance} m`} empty="No walk recorded today yet" trend={dashboard.trends.walk_7d} />
        <SummaryCard title="Guitar" value={dashboard.today.songs === null ? null : `${dashboard.today.songs} songs`} empty="No guitar recorded today yet" />
        <SummaryCard title="Current NYHA" value={dashboard.today.nyha === null ? null : `Class ${dashboard.today.nyha}`} empty="No NYHA recorded today yet" />
      </section>
      <p><a className="btn-primary no-underline" href="/">Record today's observations</a></p>
    </PageShell>
  )
}
