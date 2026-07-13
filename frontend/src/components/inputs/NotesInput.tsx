import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function NotesInput({ value, onChange, onBlur, saveState }: { value: string; onChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return <label>Notes<textarea value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} rows={5} /><SaveStatus state={saveState} /></label>
}
