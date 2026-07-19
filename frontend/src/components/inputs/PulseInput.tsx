import { Field } from '../ui/PageShell'
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function PulseInput({ value, onChange, onBlur, saveState }: { value: string; onChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return (
    <Field label="Pulse (BPM)">
      <input className="input-control" value={value} inputMode="numeric" onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />
      <SaveStatus state={saveState} />
    </Field>
  )
}
