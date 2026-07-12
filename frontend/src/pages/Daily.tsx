import { useEffect, useState } from 'react'

import * as observationsApi from '../api/observations'
import type { DailyObservations, ObservationType } from '../api/observations'
import { useAuth } from '../auth/AuthContext'
import { BloodPressureInput } from '../components/inputs/BloodPressureInput'
import { DailyChecklist } from '../components/inputs/DailyChecklist'
import { NotesInput } from '../components/inputs/NotesInput'
import { NyhaSelector } from '../components/inputs/NyhaSelector'
import { PulseInput } from '../components/inputs/PulseInput'
import type { SaveState } from '../components/inputs/SaveStatus'
import { SongsInput } from '../components/inputs/SongsInput'
import { SymptomsSelector } from '../components/inputs/SymptomsSelector'
import { WalkInput } from '../components/inputs/WalkInput'
import { WeightInput } from '../components/inputs/WeightInput'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`))
}

function routeDate() {
  const path = window.location.pathname.replace(/^\//, '')
  return path === '' ? todayIso() : path
}

function stringValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : ''
}

function arrayValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : []
}

export function Daily() {
  const auth = useAuth()
  const date = routeDate()
  const [daily, setDaily] = useState<DailyObservations | null>(null)
  const [values, setValues] = useState<Record<string, string | string[]>>({})
  const [saveStates, setSaveStates] = useState<Partial<Record<ObservationType, SaveState>>>({})
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!auth.accessToken || !isIsoDate(date)) return
    observationsApi.getDailyObservations(date, auth.accessToken)
      .then((data) => {
        setDaily(data)
        setValues(Object.fromEntries(Object.entries(data.observations).map(([key, observation]) => [key, observation.value])))
        setLoadError(false)
      })
      .catch((error: Error) => {
        if (error.message !== '401') setLoadError(true)
      })
  }, [auth.accessToken, date])

  function isBlank(value: string) {
    return value.trim() === ''
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
    const timeSeconds = stringValue(values.walk_time)
    const stops = stringValue(values.walk_stops)
    if (isBlank(distance) || isBlank(timeSeconds) || isBlank(stops)) {
      skipSave('walk_distance')
      return
    }
    void save('walk_distance', distance, { time_seconds: timeSeconds, stops })
  }

  async function save(type: ObservationType, value: string | string[], metadata: Record<string, unknown> | null = null) {
    if (!auth.accessToken) return
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

  if (!isIsoDate(date)) return <main><h1>That date does not look right</h1><a href="/">Go to today</a></main>
  if (loadError) return <main><h1>Could not load observations</h1><p>Please try again.</p></main>
  if (!daily) return <p>Loading...</p>

  const bp = stringValue(values.bp).split('/')
  const historical = date !== todayIso()

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem', display: 'grid', gap: '1.5rem' }}>
      {historical ? <aside style={{ background: '#fef3c7', padding: '1rem', borderRadius: '0.75rem' }}>You are editing {date}. <a href="/">Go to today</a></aside> : null}
      <h1>Today's Recovery</h1>
      <DailyChecklist items={daily.checklist} />
      <section><h2>Vitals</h2><div id="section-weight"><WeightInput value={stringValue(values.weight)} onChange={(value) => setValues((current) => ({ ...current, weight: value }))} onBlur={() => saveNonBlank('weight', stringValue(values.weight))} saveState={saveStates.weight ?? 'idle'} /></div><div id="section-pulse"><PulseInput value={stringValue(values.pulse)} onChange={(value) => setValues((current) => ({ ...current, pulse: value }))} onBlur={() => saveNonBlank('pulse', stringValue(values.pulse))} saveState={saveStates.pulse ?? 'idle'} /></div><div id="section-bp"><BloodPressureInput systolic={bp[0] ?? ''} diastolic={bp[1] ?? ''} onSystolicChange={(value) => setValues((current) => ({ ...current, bp: `${value}/${bp[1] ?? ''}` }))} onDiastolicChange={(value) => setValues((current) => ({ ...current, bp: `${bp[0] ?? ''}/${value}` }))} onBlur={saveBloodPressure} saveState={saveStates.bp ?? 'idle'} /></div></section>
      <section id="section-walk_distance"><h2>Walk</h2><WalkInput distance={stringValue(values.walk_distance)} timeSeconds={stringValue(values.walk_time)} stops={stringValue(values.walk_stops)} onDistanceChange={(value) => setValues((current) => ({ ...current, walk_distance: value }))} onTimeSecondsChange={(value) => setValues((current) => ({ ...current, walk_time: value }))} onStopsChange={(value) => setValues((current) => ({ ...current, walk_stops: value }))} onDistanceBlur={saveWalkDistance} onTimeSecondsBlur={() => saveNonBlank('walk_time', stringValue(values.walk_time))} onStopsBlur={() => saveNonBlank('walk_stops', stringValue(values.walk_stops))} saveState={saveStates.walk_distance ?? saveStates.walk_time ?? saveStates.walk_stops ?? 'idle'} /></section>
      <section id="section-songs"><h2>Guitar</h2><SongsInput value={stringValue(values.songs)} onChange={(value) => setValues((current) => ({ ...current, songs: value }))} onBlur={() => saveNonBlank('songs', stringValue(values.songs))} saveState={saveStates.songs ?? 'idle'} /></section>
      <section><h2>Symptoms</h2><div id="section-nyha"><NyhaSelector value={stringValue(values.nyha)} onSelect={(value) => { setValues((current) => ({ ...current, nyha: value })); void save('nyha', value) }} saveState={saveStates.nyha ?? 'idle'} /></div><div id="section-symptoms"><SymptomsSelector value={arrayValue(values.symptoms)} onChange={(value) => { setValues((current) => ({ ...current, symptoms: value })); void save('symptoms', value) }} saveState={saveStates.symptoms ?? 'idle'} /></div></section>
      <section id="section-notes"><h2>Notes</h2><NotesInput value={stringValue(values.notes)} onChange={(value) => setValues((current) => ({ ...current, notes: value }))} onBlur={() => save('notes', stringValue(values.notes))} saveState={saveStates.notes ?? 'idle'} /></section>
    </main>
  )
}
