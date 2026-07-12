import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function BloodPressureInput({ systolic, diastolic, onSystolicChange, onDiastolicChange, onBlur, saveState }: { systolic: string; diastolic: string; onSystolicChange: (value: string) => void; onDiastolicChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return (
    <fieldset>
      <legend>Blood pressure</legend>
      <label>SYS<input value={systolic} inputMode="numeric" onChange={(event) => onSystolicChange(event.target.value)} onBlur={onBlur} /></label>
      <label>DIA<input value={diastolic} inputMode="numeric" onChange={(event) => onDiastolicChange(event.target.value)} onBlur={onBlur} /></label>
      <SaveStatus state={saveState} />
    </fieldset>
  )
}
