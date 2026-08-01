import { useEffect, useState } from 'react'

import * as observationsApi from '../api/observations'
import type { DailyObservations, ObservationType } from '../api/observations'
import { useAuth } from '../auth/AuthContext'
import { BloodPressureInput } from '../components/inputs/BloodPressureInput'
import { DailyChecklist } from '../components/inputs/DailyChecklist'
import { NotesInput } from '../components/inputs/NotesInput'
import { NyhaSelector } from '../components/inputs/NyhaSelector'
import { OxygenInput } from '../components/inputs/OxygenInput'
import { PulseInput } from '../components/inputs/PulseInput'
import type { SaveState } from '../components/inputs/SaveStatus'
import { SongsInput } from '../components/inputs/SongsInput'
import { SymptomsSelector } from '../components/inputs/SymptomsSelector'
import { WalkInput } from '../components/inputs/WalkInput'
import { WeightInput } from '../components/inputs/WeightInput'
import { PageHeader, PageShell, SectionCard } from '../components/ui/PageShell'

function todayIso() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)

  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
}

function routeDate() {
  const path = window.location.pathname.replace(/^\//, '')
  return path === '' ? todayIso() : path
}

function navigateToDate(value: string) {
  if (value === todayIso()) {
    window.history.pushState(null, '', '/')
  } else {
    window.history.pushState(null, '', `/${value}`)
  }
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function stringValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : ''
}

function arrayValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : []
}

function isBlankString(value: string) {
  return value.trim() === ''
}

function secondsToMinutesValue(value: string | string[] | undefined) {
  const rawValue = stringValue(value)
  if (isBlankString(rawValue)) return ''

  const seconds = Number(rawValue)
  if (!Number.isFinite(seconds)) return rawValue
  return String(Math.round(seconds / 60))
}

function minutesToSecondsValue(value: string) {
  if (isBlankString(value)) return ''

  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return value
  return String(Math.round(minutes * 60))
}

function combinedWalkSaveState(saveStates: Partial<Record<ObservationType, SaveState>>): SaveState {
  const states = [saveStates.walk_distance, saveStates.walk_time, saveStates.walk_stops]
  if (states.includes('error')) return 'error'
  if (states.includes('saving')) return 'saving'
  if (states.includes('saved')) return 'saved'
  return 'idle'
}

export function Daily() {
  const auth = useAuth()
  const [pathDate, setPathDate] = useState(routeDate())
  const [daily, setDaily] = useState<DailyObservations | null>(null)
  const [loadedDate, setLoadedDate] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string | string[]>>({})
  const [saveStates, setSaveStates] = useState<Partial<Record<ObservationType, SaveState>>>({})
  const [loadErrorDate, setLoadErrorDate] = useState<string | null>(null)
  const date = pathDate

  useEffect(() => {
    function updatePathDate() {
      setPathDate(routeDate())
    }
    window.addEventListener('popstate', updatePathDate)
    return () => window.removeEventListener('popstate', updatePathDate)
  }, [])

  useEffect(() => {
    if (!auth.accessToken || !isIsoDate(date)) return
    let cancelled = false
    observationsApi.getDailyObservations(date, auth.accessToken)
      .then((data) => {
        if (cancelled) return
        setDaily(data)
        setLoadedDate(date)
        setSaveStates({})
        setValues(Object.fromEntries(Object.entries(data.observations).map(([key, observation]) => [
          key,
          key === 'walk_time' ? secondsToMinutesValue(observation.value) : observation.value,
        ])))
        setLoadErrorDate(null)
      })
      .catch((error: Error) => {
        if (cancelled) return
        if (error.message !== '401') setLoadErrorDate(date)
      })
    return () => {
      cancelled = true
    }
  }, [auth.accessToken, date])

  function isBlank(value: string) {
    return isBlankString(value)
  }

  function skipSave(type: ObservationType) {
    setSaveStates((current) => ({ ...current, [type]: 'idle' }))
  }

  function saveNonBlank(type: ObservationType, value: string) {
    if (isBlank(value)) {
      skipSave(type)
      return
    }
    void save(type, value)
  }

  function saveBloodPressure() {
    const value = stringValue(values.bp)
    const parts = value.split('/')
    if (isBlank(parts[0] ?? '') || isBlank(parts[1] ?? '')) {
      skipSave('bp')
      return
    }
    void save('bp', value)
  }

  function saveWalkDistance() {
    const distance = stringValue(values.walk_distance)
    const timeSeconds = minutesToSecondsValue(stringValue(values.walk_time))
    const stops = stringValue(values.walk_stops)
    if (isBlank(distance)) {
      skipSave('walk_distance')
      return
    }

    const metadata: Record<string, unknown> = {}
    if (!isBlank(timeSeconds)) metadata.time_seconds = timeSeconds
    if (!isBlank(stops)) metadata.stops = stops

    void save('walk_distance', distance, Object.keys(metadata).length > 0 ? metadata : null)
  }

  async function save(type: ObservationType, value: string | string[], metadata: Record<string, unknown> | null = null) {
    if (!auth.accessToken || !isIsoDate(date)) return
    setSaveStates((current) => ({ ...current, [type]: 'saving' }))
    try {
      await observationsApi.saveObservation(date, type, value, auth.accessToken, metadata)
      const refreshed = await observationsApi.getDailyObservations(date, auth.accessToken)
      setDaily(refreshed)
      setSaveStates((current) => ({ ...current, [type]: 'saved' }))
    } catch {
      setSaveStates((current) => ({ ...current, [type]: 'error' }))
    }
  }

  if (!isIsoDate(date)) return <PageShell><SectionCard><h1 className="section-title">That date does not look right</h1><a href="/">Go to today</a></SectionCard></PageShell>
  if (loadErrorDate === date) return <PageShell><SectionCard><h1 className="section-title">Could not load observations</h1><p className="page-copy">Please try again.</p></SectionCard></PageShell>
  if (!daily || loadedDate !== date) return <PageShell><SectionCard><p className="page-copy">Loading...</p></SectionCard></PageShell>

  const bp = stringValue(values.bp).split('/')
  const historical = date !== todayIso()

  return (
    <PageShell>
      {historical ? <aside className="status-banner border-blue-200 bg-blue-50 text-blue-950">You are adding readings for {date}. <a href="/">Today</a></aside> : null}
      <PageHeader kicker="Readings" title="Add Readings">
        <p>Record Simon's readings for the selected date. Each field saves automatically.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="field-label">
            Reading date
            <input
              className="input-control mt-1"
              type="date"
              value={date}
              onChange={(event) => navigateToDate(event.target.value)}
            />
          </label>
          <a className="btn-secondary self-start sm:self-auto" href="/">Today</a>
        </div>
      </PageHeader>
      <SectionCard>
        <h2 className="section-title mb-4">Readings checklist</h2>
        <DailyChecklist items={daily.checklist} />
      </SectionCard>
      <SectionCard>
        <h2 className="section-title mb-4">Vitals</h2>
        <div className="grid gap-5 scroll-mt-6" id="section-weight">
          <WeightInput value={stringValue(values.weight)} onChange={(value) => setValues((current) => ({ ...current, weight: value }))} onBlur={() => saveNonBlank('weight', stringValue(values.weight))} saveState={saveStates.weight ?? 'idle'} />
        </div>
        <div className="mt-5 grid gap-5 scroll-mt-6" id="section-pulse">
          <PulseInput value={stringValue(values.pulse)} onChange={(value) => setValues((current) => ({ ...current, pulse: value }))} onBlur={() => saveNonBlank('pulse', stringValue(values.pulse))} saveState={saveStates.pulse ?? 'idle'} />
        </div>
        <div className="mt-5 grid gap-5 scroll-mt-6" id="section-oxygen">
          <OxygenInput value={stringValue(values.oxygen)} onChange={(value) => setValues((current) => ({ ...current, oxygen: value }))} onBlur={() => saveNonBlank('oxygen', stringValue(values.oxygen))} saveState={saveStates.oxygen ?? 'idle'} />
        </div>
        <div className="mt-5 scroll-mt-6" id="section-bp">
          <BloodPressureInput systolic={bp[0] ?? ''} diastolic={bp[1] ?? ''} onSystolicChange={(value) => setValues((current) => ({ ...current, bp: `${value}/${bp[1] ?? ''}` }))} onDiastolicChange={(value) => setValues((current) => ({ ...current, bp: `${bp[0] ?? ''}/${value}` }))} onBlur={saveBloodPressure} saveState={saveStates.bp ?? 'idle'} />
        </div>
      </SectionCard>
      <SectionCard className="scroll-mt-6" id="section-walk_distance">
        <h2 className="section-title mb-4">Walk</h2>
        <WalkInput distance={stringValue(values.walk_distance)} timeSeconds={stringValue(values.walk_time)} stops={stringValue(values.walk_stops)} onDistanceChange={(value) => setValues((current) => ({ ...current, walk_distance: value }))} onTimeSecondsChange={(value) => setValues((current) => ({ ...current, walk_time: value }))} onStopsChange={(value) => setValues((current) => ({ ...current, walk_stops: value }))} onDistanceBlur={saveWalkDistance} onTimeSecondsBlur={() => saveNonBlank('walk_time', minutesToSecondsValue(stringValue(values.walk_time)))} onStopsBlur={() => saveNonBlank('walk_stops', stringValue(values.walk_stops))} saveState={combinedWalkSaveState(saveStates)} />
      </SectionCard>
      <SectionCard className="scroll-mt-6" id="section-songs">
        <h2 className="section-title mb-4">Guitar</h2>
        <SongsInput value={stringValue(values.songs)} onChange={(value) => setValues((current) => ({ ...current, songs: value }))} onBlur={() => saveNonBlank('songs', stringValue(values.songs))} saveState={saveStates.songs ?? 'idle'} />
      </SectionCard>
      <SectionCard>
        <h2 className="section-title mb-4">Symptoms</h2>
        <div className="scroll-mt-6" id="section-nyha">
          <NyhaSelector value={stringValue(values.nyha)} onSelect={(value) => { setValues((current) => ({ ...current, nyha: value })); void save('nyha', value) }} saveState={saveStates.nyha ?? 'idle'} />
        </div>
        <div className="mt-6 scroll-mt-6" id="section-symptoms">
          <SymptomsSelector value={arrayValue(values.symptoms)} onChange={(value) => { setValues((current) => ({ ...current, symptoms: value })); void save('symptoms', value) }} saveState={saveStates.symptoms ?? 'idle'} />
        </div>
      </SectionCard>
      <SectionCard className="scroll-mt-6" id="section-notes">
        <h2 className="section-title mb-4">Notes</h2>
        <NotesInput value={stringValue(values.notes)} onChange={(value) => setValues((current) => ({ ...current, notes: value }))} onBlur={() => save('notes', stringValue(values.notes))} saveState={saveStates.notes ?? 'idle'} />
      </SectionCard>
    </PageShell>
  )
}
