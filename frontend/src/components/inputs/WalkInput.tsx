import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function WalkInput({ distance, timeSeconds, stops, onDistanceChange, onTimeSecondsChange, onStopsChange, onDistanceBlur, onTimeSecondsBlur, onStopsBlur, saveState }: { distance: string; timeSeconds: string; stops: string; onDistanceChange: (value: string) => void; onTimeSecondsChange: (value: string) => void; onStopsChange: (value: string) => void; onDistanceBlur: () => void; onTimeSecondsBlur: () => void; onStopsBlur: () => void; saveState: SaveState }) {
  return (
    <fieldset>
      <legend>Walk</legend>
      <label>Distance (m)<input value={distance} inputMode="numeric" onChange={(event) => onDistanceChange(event.target.value)} onBlur={onDistanceBlur} /></label>
      <label>Time (seconds)<input value={timeSeconds} inputMode="numeric" onChange={(event) => onTimeSecondsChange(event.target.value)} onBlur={onTimeSecondsBlur} /></label>
      <label>Stops<input value={stops} inputMode="numeric" onChange={(event) => onStopsChange(event.target.value)} onBlur={onStopsBlur} /></label>
      <SaveStatus state={saveState} />
    </fieldset>
  )
}
