import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

const OPTIONS = [
  { value: '1', label: 'I - No symptoms during ordinary activity', color: '#22c55e' },
  { value: '2', label: 'II - Mild limitation', color: '#eab308' },
  { value: '3', label: 'III - Marked limitation', color: '#f97316' },
  { value: '4', label: 'IV - Symptoms at rest', color: '#ef4444' },
]

export function NyhaSelector({ value, onSelect, saveState }: { value: string; onSelect: (value: string) => void; saveState: SaveState }) {
  return (
    <fieldset>
      <legend>NYHA class</legend>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {OPTIONS.map((option) => (
          <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onSelect(option.value)} style={{ border: `2px solid ${option.color}`, background: value === option.value ? option.color : 'white', padding: '0.75rem' }}>
            {option.label}
          </button>
        ))}
      </div>
      <SaveStatus state={saveState} />
    </fieldset>
  )
}
