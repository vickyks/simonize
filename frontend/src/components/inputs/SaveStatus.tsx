export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function SaveStatus({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  const message = {
    saving: 'Saving...',
    saved: 'Saved ✓',
    error: 'Could not save - try again',
  }[state]
  return (
    <span style={{ color: state === 'error' ? '#b45309' : '#166534', fontSize: '0.875rem' }}>
      {message}
    </span>
  )
}
