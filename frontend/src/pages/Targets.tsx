import { FormEvent, useEffect, useState } from 'react'

import * as targetsApi from '../api/targets'
import type { MilestoneEntry, TargetEntry, TargetType, TargetsResponse } from '../api/targets'
import { PageHeader, PageShell, SectionCard } from '../components/ui/PageShell'

type TargetsProps = { accessToken: string }
const EMPTY_MILESTONES = "Keep recording - milestones will appear here as Simon's recovery builds."

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function targetInputMode(type: TargetType): 'numeric' {
  return type === 'nyha' ? 'numeric' : 'numeric'
}

function MilestoneList({ milestones }: { milestones: MilestoneEntry[] }) {
  if (milestones.length === 0) return <p>{EMPTY_MILESTONES}</p>
  return (
    <div className="grid gap-3">
      {milestones.map((milestone) => (
        <article className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4" key={milestone.type}>
          <p className="text-sm font-semibold text-slate-500">{formatDate(milestone.date)}</p>
          <h3 className="text-xl font-bold text-clinical-ink">{milestone.title}</h3>
          <p>{milestone.message}</p>
          {milestone.value ? <p className="font-semibold text-clinical-primaryDark">{milestone.value}</p> : null}
        </article>
      ))}
    </div>
  )
}

function targetValue(targets: TargetEntry[], type: TargetType) {
  return String(targets.find((target) => target.type === type)?.value ?? '')
}

export function Targets({ accessToken }: TargetsProps) {
  const [response, setResponse] = useState<TargetsResponse | null>(null)
  const [values, setValues] = useState<Record<TargetType, string>>({ walk_distance: '', songs: '', nyha: '' })
  const [loadError, setLoadError] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    targetsApi.getTargets(accessToken).then((data) => {
      setResponse(data)
      setValues({
        walk_distance: targetValue(data.targets, 'walk_distance'),
        songs: targetValue(data.targets, 'songs'),
        nyha: targetValue(data.targets, 'nyha'),
      })
      setLoadError(false)
    }).catch((error: Error) => {
      if (error.message !== '401') setLoadError(true)
    })
  }, [accessToken])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveError(false)
    setSaved(false)
    try {
      let latest = response
      for (const type of ['walk_distance', 'songs', 'nyha'] as TargetType[]) {
        const original = response?.targets.find((target) => target.type === type)
        if (original && values[type] !== String(original.value)) {
          latest = await targetsApi.updateTarget(accessToken, type, values[type])
        }
      }
      if (latest) {
        setResponse(latest)
        setValues({
          walk_distance: targetValue(latest.targets, 'walk_distance'),
          songs: targetValue(latest.targets, 'songs'),
          nyha: targetValue(latest.targets, 'nyha'),
        })
      }
      setSaved(true)
    } catch {
      setSaveError(true)
    }
  }

  if (loadError) return <PageShell><PageHeader title="Could not load targets"><p>Please try again.</p></PageHeader></PageShell>
  if (!response) return <PageShell><SectionCard><p>Loading...</p></SectionCard></PageShell>

  return (
    <PageShell>
      <PageHeader title="Targets & Milestones">
        <p>Set Simon's next recovery targets and see the progress already achieved.</p>
      </PageHeader>
      <SectionCard>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {response.targets.map((target) => (
            <label className="grid gap-1 font-semibold text-clinical-ink" key={target.type}>
              {target.label}
              <input
                aria-label={target.label}
                className="rounded-xl border border-slate-300 px-3 py-2"
                inputMode={targetInputMode(target.type)}
                type="number"
                value={values[target.type]}
                onChange={(event) => setValues((current) => ({ ...current, [target.type]: event.target.value }))}
              />
              <span className="text-sm text-slate-500">{target.unit}</span>
            </label>
          ))}
          {saveError ? <p role="alert">Could not save targets - please try again.</p> : null}
          {saved ? <p>Saved</p> : null}
          <button className="btn-primary justify-self-start" type="submit">Save targets</button>
        </form>
      </SectionCard>
      <SectionCard>
        <h2 className="text-2xl font-bold text-clinical-ink">Milestones</h2>
        <MilestoneList milestones={response.milestones} />
      </SectionCard>
    </PageShell>
  )
}
