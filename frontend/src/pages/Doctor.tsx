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

import * as summaryApi from '../api/summary'
import type {
  SummaryBpPoint,
  SummaryDays,
  SummaryPoint,
  SummaryResponse,
  SummaryWalkPoint,
} from '../api/summary'

type DoctorProps = { accessToken: string }
const EMPTY_TEXT = 'No data recorded for this period.'
const SYMPTOM_LABELS: Record<string, string> = {
  breathless: 'Breathless',
  chest_discomfort: 'Chest discomfort',
  palpitations: 'Palpitations',
  swollen_ankles: 'Swollen ankles',
  dizzy: 'Dizzy',
  very_tired: 'Very tired',
  poor_sleep: 'Poor sleep',
  poor_appetite: 'Poor appetite',
  good_day: 'Good day',
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '-'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) return `${minutes} min`
  return `${minutes} min ${remainingSeconds} sec`
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="doctor-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function PointTable({ rows, unit }: { rows: SummaryPoint[]; unit: string }) {
  if (rows.length === 0) return <p>{EMPTY_TEXT}</p>
  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.date}>
            <td>{formatDate(row.date)}</td>
            <td>
              {row.value} {unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PointLineChart({ data, unit }: { data: SummaryPoint[]; unit: string }) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip formatter={(value) => [`${value} ${unit}`, unit]} />
        <Line type="monotone" dataKey="value" stroke="#111827" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  )
}

function PointBarChart({ data, unit }: { data: SummaryPoint[]; unit: string }) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip formatter={(value) => [`${value} ${unit}`, unit]} />
        <Bar dataKey="value" fill="#111827" />
      </BarChart>
    </ResponsiveContainer>
  )
}

function BpSection({ rows }: { rows: SummaryBpPoint[] }) {
  return (
    <Section title="Blood Pressure">
      {rows.length === 0 ? (
        <p>{EMPTY_TEXT}</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line name="Systolic" dataKey="systolic" stroke="#111827" />
              <Line name="Diastolic" dataKey="diastolic" stroke="#6b7280" />
            </LineChart>
          </ResponsiveContainer>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Systolic</th>
                <th>Diastolic</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.systolic}</td>
                  <td>{row.diastolic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Section>
  )
}

function WalkSection({ rows }: { rows: SummaryWalkPoint[] }) {
  const chartRows = rows.map((row) => ({ date: row.date, value: row.distance }))
  return (
    <Section title="Walk">
      {rows.length === 0 ? (
        <p>{EMPTY_TEXT}</p>
      ) : (
        <>
          <PointBarChart data={chartRows} unit="m" />
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Distance</th>
                <th>Time</th>
                <th>Stops</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.distance} m</td>
                  <td>{formatDuration(row.time_seconds)}</td>
                  <td>{row.stops ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Section>
  )
}

function SymptomsSection({ summary }: { summary: SummaryResponse }) {
  return (
    <Section title="Symptoms">
      {summary.symptoms.length === 0 ? (
        <p>{EMPTY_TEXT}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Recorded symptoms</th>
            </tr>
          </thead>
          <tbody>
            {summary.symptoms.map((entry) => (
              <tr key={entry.date}>
                <td>{formatDate(entry.date)}</td>
                <td>
                  <ul>
                    {entry.values.map((value) => (
                      <li key={value}>{SYMPTOM_LABELS[value] ?? value}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

function NotesSection({ summary }: { summary: SummaryResponse }) {
  return (
    <Section title="Notes">
      {summary.notes.length === 0 ? (
        <p>{EMPTY_TEXT}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {summary.notes.map((entry) => (
              <tr key={entry.date}>
                <td>{formatDate(entry.date)}</td>
                <td>{entry.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

function DoctorHeader({
  days,
  summary,
  setDays,
}: {
  days: SummaryDays
  summary: SummaryResponse
  setDays: (days: SummaryDays) => void
}) {
  return (
    <section>
      <h1>Doctor Summary</h1>
      <p>{`Last ${summary.range.days} days: ${formatDate(summary.range.start_date)} to ${formatDate(summary.range.end_date)}`}</p>
      <p>Generated: {new Date(summary.range.generated_at).toLocaleString('en-GB')}</p>
      <div className="no-print">
        <button type="button" aria-pressed={days === '7'} onClick={() => setDays('7')}>
          Last 7 days
        </button>
        <button type="button" aria-pressed={days === '30'} onClick={() => setDays('30')}>
          Last 30 days
        </button>
        <button type="button" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>
    </section>
  )
}

export function Doctor({ accessToken }: DoctorProps) {
  const [days, setDays] = useState<SummaryDays>('7')
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    summaryApi
      .getSummary(accessToken, days)
      .then((data) => {
        if (!active) return
        setSummary(data)
        setLoadError(false)
      })
      .catch((error: Error) => {
        if (!active) return
        if (error.message !== '401') setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [accessToken, days])

  if (loadError) {
    return (
      <main>
        <h1>Could not load doctor summary</h1>
        <p>Please try again.</p>
      </main>
    )
  }
  if (!summary) return <p>Loading...</p>

  return (
    <main className="doctor-report">
      <style>{`@media print { header, .no-print { display: none !important; } body { background: #fff; color: #000; } .doctor-report { margin: 0; font-size: 11pt; } .doctor-section { break-inside: avoid; page-break-inside: avoid; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #000; padding: 0.25rem; } }`}</style>
      <DoctorHeader days={days} summary={summary} setDays={setDays} />
      <Section title="Weight">
        <PointLineChart data={summary.vitals.weight} unit="kg" />
        <PointTable rows={summary.vitals.weight} unit="kg" />
      </Section>
      <Section title="Pulse">
        <PointLineChart data={summary.vitals.pulse} unit="bpm" />
        <PointTable rows={summary.vitals.pulse} unit="bpm" />
      </Section>
      <BpSection rows={summary.vitals.bp} />
      <WalkSection rows={summary.activity.walk} />
      <Section title="Guitar">
        <PointBarChart data={summary.activity.songs} unit="songs" />
        <PointTable rows={summary.activity.songs} unit="songs" />
      </Section>
      <Section title="NYHA">
        <PointLineChart data={summary.functional.nyha} unit="class" />
        <PointTable rows={summary.functional.nyha} unit="class" />
      </Section>
      <SymptomsSection summary={summary} />
      <NotesSection summary={summary} />
    </main>
  )
}
