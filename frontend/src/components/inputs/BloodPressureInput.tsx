import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function BloodPressureInput({ systolic, diastolic, onSystolicChange, onDiastolicChange, onBlur, saveState }: { systolic: string; diastolic: string; onSystolicChange: (value: string) => void; onDiastolicChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="sr-only">Blood pressure</legend>
      <label className="field-label">
        SYS
        <input className="input-control" value={systolic} inputMode="numeric" onChange={(event) => onSystolicChange(event.target.value)} onBlur={onBlur} />
      </label>
      <label className="field-label">
        DIA
        <input className="input-control" value={diastolic} inputMode="numeric" onChange={(event) => onDiastolicChange(event.target.value)} onBlur={onBlur} />
      </label>
      <div className="sm:col-span-2"><SaveStatus state={saveState} /></div>
    </fieldset>
  )
}
