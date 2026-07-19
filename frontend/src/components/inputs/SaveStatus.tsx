import { classes } from '../ui/PageShell'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function SaveStatus({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  const message = {
    saving: 'Saving...',
    saved: 'Saved ✓',
    error: 'Could not save - try again',
  }[state]
  return (
    <span
      aria-live="polite"
      className={classes(
        'mt-2 inline-flex text-sm font-semibold',
        state === 'error' ? 'text-amber-700' : 'text-emerald-700',
      )}
    >
      {message}
    </span>
  )
}
