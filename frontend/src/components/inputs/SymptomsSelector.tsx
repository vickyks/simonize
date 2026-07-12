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
    <fieldset>
      <legend>Symptoms</legend>
      {SYMPTOMS.map((symptom) => (
        <label key={symptom.key} style={{ display: 'block' }}>
          <input type="checkbox" checked={value.includes(symptom.key)} onChange={() => toggle(symptom.key)} /> {symptom.label}
        </label>
      ))}
      <SaveStatus state={saveState} />
    </fieldset>
  )
}
