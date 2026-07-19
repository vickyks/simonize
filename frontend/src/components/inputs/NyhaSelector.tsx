import { classes } from '../ui/PageShell'
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
    <fieldset className="grid gap-3">
      <legend className="field-label mb-1">NYHA class</legend>
      <div className="grid gap-3">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onSelect(option.value)}
            className={classes(
              'w-full rounded-2xl border-2 px-4 py-3 text-left text-base font-semibold transition focus:outline-none focus:ring-2 focus:ring-clinical-primary focus:ring-offset-2',
              value === option.value && option.color === '#eab308' ? 'text-slate-950' : null,
              value === option.value && option.color !== '#eab308' ? 'text-white' : null,
              value !== option.value ? 'bg-white text-slate-700 hover:bg-slate-50' : null,
            )}
            style={{ borderColor: option.color, backgroundColor: value === option.value ? option.color : undefined }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <SaveStatus state={saveState} />
    </fieldset>
  )
}
