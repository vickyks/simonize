import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function WeightInput({ value, onChange, onBlur, saveState }: { value: string; onChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return <label>Weight (kg)<input value={value} inputMode="decimal" onChange={(event) => onChange(event.target.value)} onBlur={onBlur} /><SaveStatus state={saveState} /></label>
}
