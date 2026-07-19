# Walk Time Minutes UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Simon enter walk duration in minutes while preserving the existing seconds-based API/storage contract.

**Architecture:** Keep `walk_time` and `walk_distance.metadata.time_seconds` as seconds at the API boundary. Convert seconds to minutes when hydrating the Daily form and minutes to seconds when saving walk observations.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library.

## Global Constraints

- Keep backend storage and API payloads unchanged: `walk_time` remains seconds, and walk distance metadata remains `time_seconds`.
- Change the Daily walk input label from `Time (seconds)` to `Time (minutes)`.
- When existing `walk_time` seconds are loaded into the Daily form, display whole minutes.
- When the Daily form saves walk time, convert entered minutes back to seconds for both the `walk_time` observation and `walk_distance.metadata.time_seconds`.
- No database migration.
- No backend API contract change.
- No change to existing validation rules.
- No Save button.
- Preserve auto-save behaviour.

---

## File Structure

- Modify: `frontend/src/components/inputs/WalkInput.tsx` to change the label to `Time (minutes)` while keeping prop names stable.
- Modify: `frontend/src/pages/Daily.tsx` to convert seconds to minutes on load and minutes to seconds on save.
- Modify: `frontend/src/pages/Daily.test.tsx` to assert the minutes label and API conversion.

---

### Task 1: Daily Walk Time Minutes UI

**Files:**
- Modify: `frontend/src/components/inputs/WalkInput.tsx`
- Modify: `frontend/src/pages/Daily.tsx`
- Modify: `frontend/src/pages/Daily.test.tsx`

**Interfaces:**
- Consumes: existing `WalkInput` props, `Daily` local `values.walk_time`, and `observationsApi.saveObservation(date, type, value, accessToken, metadata)`.
- Produces: Daily users see and type minutes; the API still receives seconds for `walk_time` and `metadata.time_seconds`.

- [ ] **Step 1: Update the failing Daily test**

In `frontend/src/pages/Daily.test.tsx`, change the existing label assertion to:

```tsx
expect(screen.getByLabelText('Time (minutes)')).toHaveClass('input-control')
```

Add this test:

```tsx
it('saves walk time entered in minutes as seconds', async () => {
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/observations/2026-07-20') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          date: '2026-07-20',
          observations: {
            walk_time: { value: '840', metadata: null, updated_at: '2026-07-20T08:00:00Z' },
          },
          checklist: [],
        }),
      })
    }

    if (String(input) === '/api/observations/2026-07-20/walk_time') {
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }

    return Promise.resolve({ ok: true, json: async () => ({ date: '2026-07-20', observations: {}, checklist: [] }) })
  })
  vi.stubGlobal('fetch', fetch)
  window.history.replaceState(null, '', '/2026-07-20')

  render(<Daily />)

  const time = await screen.findByLabelText('Time (minutes)')
  expect(time).toHaveValue('14')

  fireEvent.change(time, { target: { value: '15' } })
  fireEvent.blur(time)

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith(
      '/api/observations/2026-07-20/walk_time',
      expect.objectContaining({ body: JSON.stringify({ value: '900', metadata: null }) }),
    )
  })
})
```

- [ ] **Step 2: Run the Daily test and verify it fails**

Run from `frontend/`:

```bash
npm test -- src/pages/Daily.test.tsx
```

Expected: FAIL because the label is still `Time (seconds)` or the value is still displayed/saved as seconds.

- [ ] **Step 3: Implement conversion helpers in `Daily.tsx`**

Add helpers near `arrayValue`:

```tsx
function secondsToMinutesValue(value: string | string[] | undefined) {
  const seconds = Number(stringValue(value))
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  return String(Math.round(seconds / 60))
}

function minutesToSecondsValue(value: string) {
  if (isBlankString(value)) return ''
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return value
  return String(Math.round(minutes * 60))
}

function isBlankString(value: string) {
  return value.trim() === ''
}
```

Replace `isBlank` body to call `isBlankString`:

```tsx
function isBlank(value: string) {
  return isBlankString(value)
}
```

When setting loaded observations, convert only `walk_time`:

```tsx
setValues(Object.fromEntries(Object.entries(data.observations).map(([key, observation]) => [
  key,
  key === 'walk_time' ? secondsToMinutesValue(observation.value) : observation.value,
])))
```

In `saveWalkDistance`, convert the current minutes value before metadata:

```tsx
const timeMinutes = stringValue(values.walk_time)
const timeSeconds = minutesToSecondsValue(timeMinutes)
```

For `WalkInput`, keep passing the minutes value:

```tsx
timeSeconds={stringValue(values.walk_time)}
```

For the walk-time blur handler, save seconds:

```tsx
onTimeSecondsBlur={() => saveNonBlank('walk_time', minutesToSecondsValue(stringValue(values.walk_time)))}
```

- [ ] **Step 4: Update `WalkInput.tsx` label**

Change:

```tsx
Time (seconds)
```

to:

```tsx
Time (minutes)
```

- [ ] **Step 5: Verify tests and build**

Run from `frontend/`:

```bash
npm test -- src/pages/Daily.test.tsx
npm run typecheck
npm run build
```

Expected: all commands pass. Build may emit the existing Vite chunk-size warning.

- [ ] **Step 6: Commit**

Run from repo root:

```bash
git add frontend/src/components/inputs/WalkInput.tsx frontend/src/pages/Daily.tsx frontend/src/pages/Daily.test.tsx
git commit -m "Use minutes for walk time input"
```
