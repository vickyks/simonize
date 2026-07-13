import { useEffect, useState } from 'react'

import * as dashboardApi from '../api/dashboard'
import type { DashboardResponse, TrendPoint } from '../api/dashboard'

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
    <svg viewBox="0 0 100 32" role="img" aria-label="7 day trend" style={{ width: '100%', height: '2rem' }}>
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
    <article style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '1rem', padding: '1rem', boxShadow: '0 8px 24px rgb(15 23 42 / 0.06)' }}>
      <h2 style={{ fontSize: '0.9rem', margin: 0, color: '#475569' }}>{title}</h2>
      <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0.5rem 0' }}>{value ?? empty}</p>
      {trend ? <Sparkline points={trend} /> : null}
    </article>
  )
}

function Advisory({ dashboard }: { dashboard: DashboardResponse }) {
  const status = dashboard.advisory.status
  const styles = {
    green: { background: '#ecfdf5', border: '#86efac', label: 'Steady', copy: 'No current concerns from recorded observations.' },
    amber: { background: '#fffbeb', border: '#fbbf24', label: 'Possible concern', copy: null },
    red: { background: '#fef2f2', border: '#f87171', label: 'Potentially serious', copy: null },
  }[status]

  return (
    <section style={{ background: styles.background, border: `1px solid ${styles.border}`, borderRadius: '1rem', padding: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>{styles.label}</h2>
      {styles.copy ? <p>{styles.copy}</p> : null}
      {dashboard.advisory.messages.length > 0 ? (
        <ul>
          {dashboard.advisory.messages.map((message) => <li key={message}>{message}</li>)}
        </ul>
      ) : null}
    </section>
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

  if (loadError) return <main><h1>Could not load dashboard</h1><p>Please try again.</p></main>
  if (!dashboard) return <p>Loading...</p>

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem', display: 'grid', gap: '1.5rem' }}>
      <section>
        <p style={{ color: '#64748b', margin: 0 }}>{formatDate(dashboard.today.date)}</p>
        <h1>Simon's Dashboard</h1>
        <p>Today's recovery picture, from the observations recorded so far.</p>
      </section>
      <Advisory dashboard={dashboard} />
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '1rem' }}>
        <SummaryCard title="Weight" value={dashboard.today.weight === null ? null : `${dashboard.today.weight} kg`} empty="No weight recorded today yet" trend={dashboard.trends.weight_7d} />
        <SummaryCard title="Pulse" value={dashboard.today.pulse === null ? null : `${dashboard.today.pulse} bpm`} empty="No pulse recorded today yet" trend={dashboard.trends.pulse_7d} />
        <SummaryCard title="Blood Pressure" value={dashboard.today.bp} empty="No blood pressure recorded today yet" />
        <SummaryCard title="Today's Walk" value={dashboard.today.walk_distance === null ? null : `${dashboard.today.walk_distance} m`} empty="No walk recorded today yet" trend={dashboard.trends.walk_7d} />
        <SummaryCard title="Guitar" value={dashboard.today.songs === null ? null : `${dashboard.today.songs} songs`} empty="No guitar recorded today yet" />
        <SummaryCard title="Current NYHA" value={dashboard.today.nyha === null ? null : `Class ${dashboard.today.nyha}`} empty="No NYHA recorded today yet" />
      </section>
      <p><a href="/">Record today's observations</a></p>
    </main>
  )
}
