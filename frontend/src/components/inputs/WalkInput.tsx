import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function WalkInput({ distance, timeSeconds, stops, onDistanceChange, onTimeSecondsChange, onStopsChange, onDistanceBlur, onTimeSecondsBlur, onStopsBlur, saveState }: { distance: string; timeSeconds: string; stops: string; onDistanceChange: (value: string) => void; onTimeSecondsChange: (value: string) => void; onStopsChange: (value: string) => void; onDistanceBlur: () => void; onTimeSecondsBlur: () => void; onStopsBlur: () => void; saveState: SaveState }) {
  return (
    <fieldset className="grid gap-4 sm:grid-cols-3">
      <legend className="sr-only">Walk</legend>
      <label className="field-label">
        Distance (m)
        <input className="input-control" value={distance} inputMode="numeric" onChange={(event) => onDistanceChange(event.target.value)} onBlur={onDistanceBlur} />
      </label>
      <label className="field-label">
        Time (seconds)
        <input className="input-control" value={timeSeconds} inputMode="numeric" onChange={(event) => onTimeSecondsChange(event.target.value)} onBlur={onTimeSecondsBlur} />
      </label>
      <label className="field-label">
        Stops
        <input className="input-control" value={stops} inputMode="numeric" onChange={(event) => onStopsChange(event.target.value)} onBlur={onStopsBlur} />
      </label>
      <div className="sm:col-span-3"><SaveStatus state={saveState} /></div>
    </fieldset>
  )
}
