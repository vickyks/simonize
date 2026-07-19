import { classes } from '../ui/PageShell'
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

const SYMPTOMS = [
  { key: 'breathless', label: 'Breathless' },
  { key: 'chest_discomfort', label: 'Chest discomfort' },
  { key: 'palpitations', label: 'Palpitations' },
  { key: 'swollen_ankles', label: 'Swollen ankles' },
  { key: 'dizzy', label: 'Dizzy' },
  { key: 'very_tired', label: 'Very tired' },
  { key: 'poor_sleep', label: 'Poor sleep' },
  { key: 'poor_appetite', label: 'Poor appetite' },
  { key: 'good_day', label: 'Good day' },
]

export function SymptomsSelector({ value, onChange, saveState }: { value: string[]; onChange: (value: string[]) => void; saveState: SaveState }) {
  function toggle(key: string) {
    if (key === 'good_day') {
      onChange(value.includes('good_day') ? [] : ['good_day'])
      return
    }
    const withoutGoodDay = value.filter((item) => item !== 'good_day')
    onChange(withoutGoodDay.includes(key) ? withoutGoodDay.filter((item) => item !== key) : [...withoutGoodDay, key])
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="field-label mb-1">Symptoms</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SYMPTOMS.map((symptom) => (
        <label
          key={symptom.key}
          className={classes(
            'flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 text-base font-semibold transition',
            symptom.key === 'good_day' && value.includes(symptom.key) ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : null,
            symptom.key === 'good_day' && !value.includes(symptom.key) ? 'border-emerald-400 bg-white text-emerald-900' : null,
            symptom.key !== 'good_day' && value.includes(symptom.key) ? 'border-clinical-primary bg-blue-50 text-slate-950' : null,
            symptom.key !== 'good_day' && !value.includes(symptom.key) ? 'border-slate-200 bg-white text-slate-700' : null,
          )}
        >
          <input className="h-4 w-4 accent-clinical-primary" type="checkbox" checked={value.includes(symptom.key)} onChange={() => toggle(symptom.key)} />
          {symptom.label}
        </label>
        ))}
      </div>
      <SaveStatus state={saveState} />
    </fieldset>
  )
}
