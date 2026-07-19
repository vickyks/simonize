import { Field } from '../ui/PageShell'
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function NotesInput({ value, onChange, onBlur, saveState }: { value: string; onChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return (
    <Field label="Notes">
      <textarea className="input-control min-h-36 resize-y" value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} rows={5} />
      <SaveStatus state={saveState} />
    </Field>
  )
}
