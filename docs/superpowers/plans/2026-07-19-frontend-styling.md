# Frontend Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a professional, consistent Clinical Calm frontend style using Tailwind, Source Sans 3, and small local layout/form primitives without changing app behaviour.

**Architecture:** Install Tailwind in the existing Vite frontend, import a single global stylesheet from `main.tsx`, and replace scattered inline/browser-default styling with focused local UI primitives. Keep business behaviour in existing pages and components; styling changes should be className/layout changes only.

**Tech Stack:** React 18, TypeScript, Vite 6, Tailwind CSS 3.4, PostCSS, Source Sans 3 via `@fontsource-variable/source-sans-3`, Vitest, Testing Library, Recharts.

## Global Constraints

- Use the Clinical Calm direction: professional, readable, restrained, and NHS-adjacent without feeling sterile.
- Use Source Sans 3 as the primary font with a robust sans-serif fallback stack.
- Preserve existing NYHA and advisory semantics from `docs/ux.md`.
- Laptop-first with generous spacing and large tap targets for tired or unwell use.
- This is a styling and layout pass only.
- No API changes.
- No backend changes unless required by build tooling, which is not expected.
- No frontend transformation of raw data.
- No observation save behaviour changes.
- No new Save button.
- No changes to advisory logic or NYHA semantics.
- No unrelated refactoring.

---

## File Structure

- Modify: `frontend/package.json` and `frontend/package-lock.json` to add Tailwind, PostCSS, Autoprefixer, and Source Sans 3 font package.
- Create: `frontend/tailwind.config.js` to define content paths, Source Sans 3 font stack, Clinical Calm colours, and print-safe configuration.
- Create: `frontend/postcss.config.js` to wire Tailwind and Autoprefixer into Vite CSS processing.
- Create: `frontend/src/index.css` for Tailwind directives, base body styling, reusable `@layer components` classes, and print styles.
- Modify: `frontend/src/main.tsx` to import `@fontsource-variable/source-sans-3` and `./index.css`.
- Create: `frontend/src/components/ui/PageShell.tsx` for page wrapper, page header, section card, empty state, field wrapper, and small class helpers.
- Create: `frontend/src/components/ui/PageShell.test.tsx` to lock down primitive rendering and class application.
- Modify: `frontend/src/App.tsx` to replace inline header styles with the global app shell/header styling.
- Modify: `frontend/src/pages/Login.tsx` to use the shared card/form/button patterns.
- Modify: `frontend/src/pages/Daily.tsx` and all files in `frontend/src/components/inputs/` to use checklist-led stacked section cards and consistent field styling.
- Modify: `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Charts.tsx`, and `frontend/src/pages/Doctor.tsx` to use shared cards/buttons/page layout while preserving existing data loading and rendering behaviour.
- Modify tests only when accessible names or deliberate structure changes require it; existing behavioural assertions should remain valid.

---

### Task 1: Tailwind And Global Styling Foundation

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/index.css`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: Existing Vite entry point `frontend/src/main.tsx`.
- Produces: Tailwind classes available across all React files, global Source Sans 3 font, and reusable component classes such as `btn`, `btn-primary`, `input-control`, `section-card`, `status-banner`, and print helpers.

- [ ] **Step 1: Install exact frontend styling dependencies**

Run from `frontend/`:

```bash
npm install @fontsource-variable/source-sans-3 && npm install -D tailwindcss@3.4.17 postcss@8.4.49 autoprefixer@10.4.20
```

Expected: `package.json` and `package-lock.json` are updated with `@fontsource-variable/source-sans-3`, `tailwindcss`, `postcss`, and `autoprefixer`.

- [ ] **Step 2: Add Tailwind config**

Create `frontend/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Source Sans 3 Variable"', '"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
      colors: {
        clinical: {
          page: '#f8fafc',
          ink: '#0f172a',
          muted: '#475569',
          line: '#dbe3ef',
          primary: '#2563eb',
          primaryDark: '#1d4ed8',
        },
      },
      boxShadow: {
        card: '0 12px 30px rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 3: Add PostCSS config**

Create `frontend/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 4: Add global CSS with reusable component classes**

Create `frontend/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    color: #0f172a;
    background: #f8fafc;
    font-family: "Source Sans 3 Variable", "Source Sans 3", system-ui, sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  body {
    min-width: 320px;
    margin: 0;
    background: #f8fafc;
    color: #0f172a;
    font-family: "Source Sans 3 Variable", "Source Sans 3", system-ui, sans-serif;
    text-rendering: optimizeLegibility;
  }

  a {
    color: #1d4ed8;
    text-decoration-thickness: 0.08em;
    text-underline-offset: 0.18em;
  }

  a:hover {
    color: #1e40af;
  }
}

@layer components {
  .app-shell {
    @apply min-h-screen bg-clinical-page text-clinical-ink;
  }

  .page-shell {
    @apply mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:px-8;
  }

  .page-kicker {
    @apply text-sm font-semibold uppercase tracking-[0.12em] text-clinical-primary;
  }

  .page-title {
    @apply mt-1 text-3xl font-bold tracking-tight text-clinical-ink sm:text-4xl;
  }

  .page-copy {
    @apply mt-2 max-w-3xl text-lg leading-7 text-clinical-muted;
  }

  .section-card {
    @apply rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6;
  }

  .section-title {
    @apply text-xl font-bold tracking-tight text-clinical-ink;
  }

  .btn {
    @apply inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-base font-semibold transition focus:outline-none focus:ring-2 focus:ring-clinical-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60;
  }

  .btn-primary {
    @apply btn bg-clinical-primary text-white shadow-sm hover:bg-clinical-primaryDark;
  }

  .btn-secondary {
    @apply btn border border-slate-300 bg-white text-slate-700 hover:bg-slate-50;
  }

  .input-control {
    @apply mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-lg text-clinical-ink shadow-sm outline-none transition placeholder:text-slate-400 focus:border-clinical-primary focus:ring-2 focus:ring-clinical-primary/20;
  }

  .field-label {
    @apply block text-sm font-semibold text-slate-700;
  }

  .field-help {
    @apply mt-1 text-sm text-slate-500;
  }

  .status-banner {
    @apply rounded-2xl border p-4 text-base leading-6;
  }

  .table-report {
    @apply w-full border-collapse overflow-hidden text-left text-sm;
  }

  .table-report th {
    @apply border-b border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-700;
  }

  .table-report td {
    @apply border-b border-slate-100 px-3 py-2 align-top text-slate-700;
  }
}

@media print {
  header,
  .no-print {
    display: none !important;
  }

  body {
    background: #fff !important;
    color: #000 !important;
  }

  .doctor-report {
    margin: 0 !important;
    max-width: none !important;
    padding: 0 !important;
    font-size: 11pt;
  }

  .doctor-section {
    break-inside: avoid;
    page-break-inside: avoid;
    border: 0 !important;
    box-shadow: none !important;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    border: 1px solid #000 !important;
    padding: 0.25rem;
  }
}
```

- [ ] **Step 5: Import font and global CSS**

Modify `frontend/src/main.tsx` to include the imports before `App`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/source-sans-3'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 6: Verify foundation builds**

Run from `frontend/`:

```bash
npm run typecheck
npm run build
```

Expected: both commands pass. The Vite build output includes generated CSS.

- [ ] **Step 7: Commit foundation**

Run from repo root:

```bash
git add frontend/package.json frontend/package-lock.json frontend/tailwind.config.js frontend/postcss.config.js frontend/src/index.css frontend/src/main.tsx
git commit -m "Add frontend styling foundation"
```

---

### Task 2: Shared Local UI Primitives

**Files:**
- Create: `frontend/src/components/ui/PageShell.tsx`
- Create: `frontend/src/components/ui/PageShell.test.tsx`

**Interfaces:**
- Consumes: Tailwind classes from Task 1.
- Produces:
  - `PageShell({ children, className? }: { children: ReactNode; className?: string })`
  - `PageHeader({ kicker?, title, children? }: { kicker?: string; title: string; children?: ReactNode })`
  - `SectionCard({ children, className?, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode })`
  - `EmptyState({ children }: { children: ReactNode })`
  - `Field({ label, children, help? }: { label: string; children: ReactNode; help?: string })`
  - `classes(...values: Array<string | false | null | undefined>): string`

- [ ] **Step 1: Write primitive rendering tests**

Create `frontend/src/components/ui/PageShell.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { EmptyState, Field, PageHeader, PageShell, SectionCard, classes } from './PageShell'

describe('UI primitives', () => {
  afterEach(() => cleanup())

  it('renders a page shell and page header', () => {
    render(
      <PageShell>
        <PageHeader kicker="Today" title="Simon's Dashboard">
          <p>Recovery picture</p>
        </PageHeader>
      </PageShell>,
    )

    expect(screen.getByRole('main')).toHaveClass('page-shell')
    expect(screen.getByText('Today')).toHaveClass('page-kicker')
    expect(screen.getByRole('heading', { name: "Simon's Dashboard" })).toHaveClass('page-title')
    expect(screen.getByText('Recovery picture')).toHaveClass('page-copy')
  })

  it('renders section cards, empty states, and fields', () => {
    render(
      <SectionCard>
        <Field label="Weight" help="Kilograms">
          <input aria-label="Weight value" />
        </Field>
        <EmptyState>No data yet</EmptyState>
      </SectionCard>,
    )

    expect(screen.getByText('Weight')).toHaveClass('field-label')
    expect(screen.getByText('Kilograms')).toHaveClass('field-help')
    expect(screen.getByText('No data yet')).toHaveClass('text-slate-500')
  })

  it('joins conditional class names', () => {
    expect(classes('base', false, undefined, 'active')).toBe('base active')
  })
})
```

- [ ] **Step 2: Run test and verify it fails before implementation**

Run from `frontend/`:

```bash
npm test -- src/components/ui/PageShell.test.tsx
```

Expected: FAIL because `./PageShell` does not exist.

- [ ] **Step 3: Implement UI primitives**

Create `frontend/src/components/ui/PageShell.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from 'react'

export function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={classes('page-shell', className)}>{children}</main>
}

export function PageHeader({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <section>
      {kicker ? <p className="page-kicker">{kicker}</p> : null}
      <h1 className="page-title">{title}</h1>
      {children ? <div className="page-copy">{children}</div> : null}
    </section>
  )
}

export function SectionCard({ children, className, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <section className={classes('section-card', className)} {...props}>{children}</section>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-slate-500">{children}</p>
}

export function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return (
    <label className="field-label">
      {label}
      {children}
      {help ? <span className="field-help">{help}</span> : null}
    </label>
  )
}
```

- [ ] **Step 4: Run primitive test and full typecheck**

Run from `frontend/`:

```bash
npm test -- src/components/ui/PageShell.test.tsx
npm run typecheck
```

Expected: both commands pass.

- [ ] **Step 5: Commit primitives**

Run from repo root:

```bash
git add frontend/src/components/ui/PageShell.tsx frontend/src/components/ui/PageShell.test.tsx
git commit -m "Add local UI primitives"
```

---

### Task 3: App Shell And Login Styling

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/Login.tsx`
- Modify only if needed: `frontend/src/App.test.tsx`
- Modify only if needed: `frontend/src/pages/Login.test.tsx`

**Interfaces:**
- Consumes: `classes` from `../components/ui/PageShell` and global button/input classes from Task 1.
  - In `App.tsx`, import as `import { classes } from './components/ui/PageShell'`.
- Produces: Styled global app shell/header and styled login card with unchanged accessible names: `Dashboard`, `Today`, `Charts`, `Doctor`, `Log out`, `Username`, `Password`, `Log in`.

- [ ] **Step 1: Run existing app and login tests before editing**

Run from `frontend/`:

```bash
npm test -- src/App.test.tsx src/pages/Login.test.tsx
```

Expected: PASS before styling changes.

- [ ] **Step 2: Replace App inline header styling**

Modify `frontend/src/App.tsx` so the authenticated return block uses the app shell. Keep the routing logic unchanged. The return block should be:

```tsx
  const navItems = [
    { href: '/dashboard', label: 'Dashboard', active: showDashboard },
    { href: '/', label: 'Today', active: !showDashboard && !showCharts && !showDoctor },
    { href: '/charts', label: 'Charts', active: showCharts },
    { href: '/doctor', label: 'Doctor', active: showDoctor },
  ]

  return (
    <div className="app-shell">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <a className="text-2xl font-bold tracking-tight text-clinical-primaryDark no-underline" href="/dashboard">
            Simonizer
          </a>
          <nav className="flex flex-wrap gap-2" aria-label="Main navigation">
            {navItems.map((item) => (
              <a
                className={classes(
                  'rounded-full px-3 py-2 text-base font-semibold no-underline transition',
                  item.active ? 'bg-blue-50 text-clinical-primaryDark' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
                href={item.href}
                key={item.href}
                aria-current={item.active ? 'page' : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <button className="btn-secondary self-start lg:self-auto" type="button" onClick={() => void auth.logout()}>
            Log out
          </button>
        </div>
      </header>
      {showDashboard ? <Dashboard accessToken={auth.accessToken ?? ''} /> : null}
      {showCharts ? <Charts accessToken={auth.accessToken ?? ''} /> : null}
      {showDoctor ? <Doctor accessToken={auth.accessToken ?? ''} /> : null}
      {!showDashboard && !showCharts && !showDoctor ? <Daily /> : null}
    </div>
  )
```

Add this import at the top:

```tsx
import { classes } from './components/ui/PageShell'
```

- [ ] **Step 3: Style Login with shared patterns**

Modify `frontend/src/pages/Login.tsx` return block to:

```tsx
  return (
    <main className="grid min-h-screen place-items-center bg-clinical-page px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
        <p className="page-kicker">Simonizer</p>
        <h1 className="page-title">Welcome back</h1>
        <p className="mt-2 text-lg leading-7 text-clinical-muted">Log in to continue tracking Simon's recovery.</p>
        <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
          <label className="field-label">
            Username
            <input
              autoComplete="username"
              className="input-control"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="field-label">
            Password
            <input
              autoComplete="current-password"
              className="input-control"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900" role="alert">{error}</p> : null}
          <button className="btn-primary w-full" type="submit">Log in</button>
        </form>
      </section>
    </main>
  )
```

- [ ] **Step 4: Run shell/login verification**

Run from `frontend/`:

```bash
npm test -- src/App.test.tsx src/pages/Login.test.tsx
npm run typecheck
```

Expected: tests and typecheck pass. If `App.test.tsx` needs updates, only add assertions for `aria-current="page"`; do not change routing expectations.

- [ ] **Step 5: Commit app shell and login**

Run from repo root:

```bash
git add frontend/src/App.tsx frontend/src/pages/Login.tsx frontend/src/App.test.tsx frontend/src/pages/Login.test.tsx
git commit -m "Style app shell and login"
```

---

### Task 4: Daily Checklist-Led Form Styling

**Files:**
- Modify: `frontend/src/pages/Daily.tsx`
- Modify: `frontend/src/components/inputs/BloodPressureInput.tsx`
- Modify: `frontend/src/components/inputs/DailyChecklist.tsx`
- Modify: `frontend/src/components/inputs/NotesInput.tsx`
- Modify: `frontend/src/components/inputs/NyhaSelector.tsx`
- Modify: `frontend/src/components/inputs/PulseInput.tsx`
- Modify: `frontend/src/components/inputs/SaveStatus.tsx`
- Modify: `frontend/src/components/inputs/SongsInput.tsx`
- Modify: `frontend/src/components/inputs/SymptomsSelector.tsx`
- Modify: `frontend/src/components/inputs/WalkInput.tsx`

**Interfaces:**
- Consumes: `PageShell`, `PageHeader`, `SectionCard`, `Field`, and `classes` from `../components/ui/PageShell` or `../../components/ui/PageShell` depending on file location.
- Produces: Daily page remains routed as before, with unchanged component props and unchanged save triggers. Inputs expose the same labels: `Weight (kg)`, `Pulse (BPM)`, `SYS`, `DIA`, `Distance (m)`, `Time (seconds)`, `Stops`, `Guitar songs`, `Notes`.

- [ ] **Step 1: Run existing frontend tests before editing Daily inputs**

Run from `frontend/`:

```bash
npm test
```

Expected: PASS before styling changes.

- [ ] **Step 2: Style SaveStatus without changing messages**

Modify `frontend/src/components/inputs/SaveStatus.tsx` to:

```tsx
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
```

- [ ] **Step 3: Style simple single-value inputs**

For `WeightInput.tsx`, `PulseInput.tsx`, `SongsInput.tsx`, and `NotesInput.tsx`, keep props unchanged and use `Field` plus `input-control`.

Example for `WeightInput.tsx`:

```tsx
import { Field } from '../ui/PageShell'
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function WeightInput({ value, onChange, onBlur, saveState }: { value: string; onChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return (
    <Field label="Weight (kg)">
      <input className="input-control" value={value} inputMode="decimal" onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />
      <SaveStatus state={saveState} />
    </Field>
  )
}
```

Apply the same pattern with the existing labels and `inputMode` values. For `NotesInput.tsx`, use:

```tsx
<textarea className="input-control min-h-36 resize-y" value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} rows={5} />
```

- [ ] **Step 4: Style grouped fieldsets**

Update `BloodPressureInput.tsx` and `WalkInput.tsx` so `fieldset` has `className="grid gap-4"`, `legend` has `className="sr-only"`, and each label uses `field-label` with `input-control`.

For `BloodPressureInput.tsx`, use this complete component body:

```tsx
export function BloodPressureInput({ systolic, diastolic, onSystolicChange, onDiastolicChange, onBlur, saveState }: { systolic: string; diastolic: string; onSystolicChange: (value: string) => void; onDiastolicChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="sr-only">Blood pressure</legend>
      <label className="field-label">
        SYS
        <input className="input-control" value={systolic} inputMode="numeric" onChange={(event) => onSystolicChange(event.target.value)} onBlur={onBlur} />
      </label>
      <label className="field-label">
        DIA
        <input className="input-control" value={diastolic} inputMode="numeric" onChange={(event) => onDiastolicChange(event.target.value)} onBlur={onBlur} />
      </label>
      <div className="sm:col-span-2"><SaveStatus state={saveState} /></div>
    </fieldset>
  )
}
```

For `WalkInput.tsx`, use `className="grid gap-4 sm:grid-cols-3"` and place `SaveStatus` in `className="sm:col-span-3"`.

- [ ] **Step 5: Style checklist buttons**

Modify `DailyChecklist.tsx` to import `classes` and use recorded/unrecorded card button styling:

```tsx
import { classes } from '../ui/PageShell'
import type { ChecklistItem } from '../../api/observations'

export function DailyChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <nav aria-label="Daily checklist" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.type}
          type="button"
          onClick={() => document.getElementById(`section-${item.type}`)?.scrollIntoView({ behavior: 'smooth' })}
          className={classes(
            'min-h-14 rounded-2xl border px-4 py-3 text-left text-base font-semibold transition focus:outline-none focus:ring-2 focus:ring-clinical-primary focus:ring-offset-2',
            item.recorded ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
          )}
        >
          <span aria-hidden="true" className="mr-2">{item.recorded ? '✓' : '☐'}</span>
          {item.label}
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 6: Style NYHA and symptoms selectors**

In `NyhaSelector.tsx`, keep the `OPTIONS` array and save behaviour. Use `classes` for full-width buttons. Each option should keep its documented colour as a border and selected fill. For selected yellow (`#eab308`), use dark text; for selected red/orange/green, white text is acceptable.

In `SymptomsSelector.tsx`, use a responsive checkbox grid. Give `good_day` an emerald border/background when selected and a stronger emerald outline when unselected. Keep mutual exclusion logic unchanged.

- [ ] **Step 7: Convert Daily page to PageShell and stacked cards**

Modify `Daily.tsx` imports:

```tsx
import { PageHeader, PageShell, SectionCard } from '../components/ui/PageShell'
```

Replace loading/error returns with styled `PageShell` variants. Replace the main return with this structure, preserving the existing state expressions exactly:

```tsx
    <PageShell>
      {historical ? <aside className="status-banner border-amber-200 bg-amber-50 text-amber-950">You are editing {date}. <a href="/">Go to today</a></aside> : null}
      <PageHeader kicker="Today" title="Today's Recovery">
        <p>Record the observations that show how Simon is doing today. Each field saves automatically.</p>
      </PageHeader>
      <SectionCard>
        <h2 className="section-title mb-4">Daily checklist</h2>
        <DailyChecklist items={daily.checklist} />
      </SectionCard>
      <SectionCard>
        <h2 className="section-title mb-4">Vitals</h2>
        <div className="grid gap-5 scroll-mt-6" id="section-weight">
          <WeightInput value={stringValue(values.weight)} onChange={(value) => setValues((current) => ({ ...current, weight: value }))} onBlur={() => saveNonBlank('weight', stringValue(values.weight))} saveState={saveStates.weight ?? 'idle'} />
        </div>
        <div className="mt-5 grid gap-5 scroll-mt-6" id="section-pulse">
          <PulseInput value={stringValue(values.pulse)} onChange={(value) => setValues((current) => ({ ...current, pulse: value }))} onBlur={() => saveNonBlank('pulse', stringValue(values.pulse))} saveState={saveStates.pulse ?? 'idle'} />
        </div>
        <div className="mt-5 scroll-mt-6" id="section-bp">
          <BloodPressureInput systolic={bp[0] ?? ''} diastolic={bp[1] ?? ''} onSystolicChange={(value) => setValues((current) => ({ ...current, bp: `${value}/${bp[1] ?? ''}` }))} onDiastolicChange={(value) => setValues((current) => ({ ...current, bp: `${bp[0] ?? ''}/${value}` }))} onBlur={saveBloodPressure} saveState={saveStates.bp ?? 'idle'} />
        </div>
      </SectionCard>
      <SectionCard className="scroll-mt-6" id="section-walk_distance">
        <h2 className="section-title mb-4">Walk</h2>
        <WalkInput distance={stringValue(values.walk_distance)} timeSeconds={stringValue(values.walk_time)} stops={stringValue(values.walk_stops)} onDistanceChange={(value) => setValues((current) => ({ ...current, walk_distance: value }))} onTimeSecondsChange={(value) => setValues((current) => ({ ...current, walk_time: value }))} onStopsChange={(value) => setValues((current) => ({ ...current, walk_stops: value }))} onDistanceBlur={saveWalkDistance} onTimeSecondsBlur={() => saveNonBlank('walk_time', stringValue(values.walk_time))} onStopsBlur={() => saveNonBlank('walk_stops', stringValue(values.walk_stops))} saveState={combinedWalkSaveState(saveStates)} />
      </SectionCard>
      <SectionCard className="scroll-mt-6" id="section-songs">
        <h2 className="section-title mb-4">Guitar</h2>
        <SongsInput value={stringValue(values.songs)} onChange={(value) => setValues((current) => ({ ...current, songs: value }))} onBlur={() => saveNonBlank('songs', stringValue(values.songs))} saveState={saveStates.songs ?? 'idle'} />
      </SectionCard>
      <SectionCard>
        <h2 className="section-title mb-4">Symptoms</h2>
        <div className="scroll-mt-6" id="section-nyha">
          <NyhaSelector value={stringValue(values.nyha)} onSelect={(value) => { setValues((current) => ({ ...current, nyha: value })); void save('nyha', value) }} saveState={saveStates.nyha ?? 'idle'} />
        </div>
        <div className="mt-6 scroll-mt-6" id="section-symptoms">
          <SymptomsSelector value={arrayValue(values.symptoms)} onChange={(value) => { setValues((current) => ({ ...current, symptoms: value })); void save('symptoms', value) }} saveState={saveStates.symptoms ?? 'idle'} />
        </div>
      </SectionCard>
      <SectionCard className="scroll-mt-6" id="section-notes">
        <h2 className="section-title mb-4">Notes</h2>
        <NotesInput value={stringValue(values.notes)} onChange={(value) => setValues((current) => ({ ...current, notes: value }))} onBlur={() => save('notes', stringValue(values.notes))} saveState={saveStates.notes ?? 'idle'} />
      </SectionCard>
    </PageShell>
```

Do not alter the existing save functions or state update semantics.

- [ ] **Step 8: Run Daily styling verification**

Run from `frontend/`:

```bash
npm test
npm run typecheck
```

Expected: tests and typecheck pass. Manual check in browser should show Daily as one checklist-led stacked page with no Save button.

- [ ] **Step 9: Commit Daily styling**

Run from repo root:

```bash
git add frontend/src/pages/Daily.tsx frontend/src/components/inputs
git commit -m "Style daily observation form"
```

---

### Task 5: Dashboard, Charts, Doctor, And Print Styling

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/pages/Charts.tsx`
- Modify: `frontend/src/pages/Doctor.tsx`
- Modify only if needed: `frontend/src/pages/Dashboard.test.tsx`
- Modify only if needed: `frontend/src/pages/Charts.test.tsx`
- Modify only if needed: `frontend/src/pages/Doctor.test.tsx`

**Interfaces:**
- Consumes: `PageShell`, `PageHeader`, `SectionCard`, `EmptyState`, and `classes` from `../components/ui/PageShell`.
- Produces: Styled dashboard cards, chart cards, doctor report sections, range buttons, and print-safe doctor report. Existing API fetch calls and displayed values remain unchanged.

- [ ] **Step 1: Run existing page tests before editing**

Run from `frontend/`:

```bash
npm test -- src/pages/Dashboard.test.tsx src/pages/Charts.test.tsx src/pages/Doctor.test.tsx
```

Expected: PASS before styling changes.

- [ ] **Step 2: Style Dashboard page and cards**

Modify `Dashboard.tsx` to import `PageShell`, `PageHeader`, `SectionCard`, and `classes`. Replace inline styles in `SummaryCard`, `Advisory`, and main return.

Use this shape for `SummaryCard`:

```tsx
function SummaryCard({ title, value, empty, trend }: { title: string; value: string | null; empty: string; trend?: TrendPoint[] }) {
  return (
    <article className="section-card grid min-h-40 gap-3">
      <h2 className="text-base font-semibold text-slate-500">{title}</h2>
      <p className={classes('text-3xl font-bold tracking-tight', value ? 'text-clinical-ink' : 'text-slate-400')}>{value ?? empty}</p>
      {trend ? <Sparkline points={trend} /> : null}
    </article>
  )
}
```

Use this main layout:

```tsx
<PageShell>
  <PageHeader kicker={formatDate(dashboard.today.date)} title="Simon's Dashboard">
    <p>Today's recovery picture, from the observations recorded so far.</p>
  </PageHeader>
  <Advisory dashboard={dashboard} />
  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    <SummaryCard title="Weight" value={dashboard.today.weight === null ? null : `${dashboard.today.weight} kg`} empty="No weight recorded today yet" trend={dashboard.trends.weight_7d} />
    <SummaryCard title="Pulse" value={dashboard.today.pulse === null ? null : `${dashboard.today.pulse} bpm`} empty="No pulse recorded today yet" trend={dashboard.trends.pulse_7d} />
    <SummaryCard title="Blood Pressure" value={dashboard.today.bp} empty="No blood pressure recorded today yet" />
    <SummaryCard title="Today's Walk" value={dashboard.today.walk_distance === null ? null : `${dashboard.today.walk_distance} m`} empty="No walk recorded today yet" trend={dashboard.trends.walk_7d} />
    <SummaryCard title="Guitar" value={dashboard.today.songs === null ? null : `${dashboard.today.songs} songs`} empty="No guitar recorded today yet" />
    <SummaryCard title="Current NYHA" value={dashboard.today.nyha === null ? null : `Class ${dashboard.today.nyha}`} empty="No NYHA recorded today yet" />
  </section>
  <p><a className="btn-primary no-underline" href="/">Record today's observations</a></p>
</PageShell>
```

Keep advisory labels and messages unchanged.

- [ ] **Step 3: Style Charts page and range buttons**

Modify `Charts.tsx` to use shared page/card styling. `ChartCard` should use `SectionCard`, `EmptyState`, and preserve `EMPTY_TEXT`. Range buttons should use `classes('btn-secondary', range === option.value && 'border-blue-600 bg-blue-50 text-blue-800')` and keep `aria-pressed`.

Keep Recharts data, colours for NYHA, and chart fetch logic unchanged.

- [ ] **Step 4: Style Doctor report and remove inline print style**

Modify `Doctor.tsx` so:

- `Section` returns `<section className="doctor-section section-card">`.
- Tables use `className="table-report"`.
- `DoctorHeader` uses `PageHeader` or equivalent Clinical Calm classes.
- Range and print buttons use `btn-secondary` and `btn-primary` as appropriate.
- The inline print `<style>` block is removed because print rules now live in `index.css`.
- The top-level return uses `<PageShell className="doctor-report">`.

Keep the `no-print` class on interactive controls so global print CSS hides them.

- [ ] **Step 5: Run page tests and full verification**

Run from `frontend/`:

```bash
npm test -- src/pages/Dashboard.test.tsx src/pages/Charts.test.tsx src/pages/Doctor.test.tsx
npm run typecheck
npm run build
```

Expected: all commands pass.

- [ ] **Step 6: Manual responsive and print check**

Run from `frontend/`:

```bash
npm run dev
```

Expected manual checks:

- `/login`, `/dashboard`, `/`, `/charts`, and `/doctor` render with Source Sans 3, pale slate background, white cards, blue primary actions, and large controls.
- Daily has checklist first and stacked cards.
- At mobile width, the header wraps and pages do not horizontally overflow.
- Doctor print preview hides navigation and buttons and uses black text on white.

- [ ] **Step 7: Commit remaining page styling**

Run from repo root:

```bash
git add frontend/src/pages/Dashboard.tsx frontend/src/pages/Charts.tsx frontend/src/pages/Doctor.tsx frontend/src/pages/Dashboard.test.tsx frontend/src/pages/Charts.test.tsx frontend/src/pages/Doctor.test.tsx
git commit -m "Style dashboard charts and doctor views"
```

---

### Task 6: Final Verification And Cleanup

**Files:**
- Modify only if required by verification: frontend files touched in Tasks 1-5.

**Interfaces:**
- Consumes: Completed styling implementation from Tasks 1-5.
- Produces: Verified frontend styling slice ready for review.

- [ ] **Step 1: Inspect worktree**

Run from repo root:

```bash
git status --short
git diff --stat
```

Expected: no unexpected unstaged files except intentional final fixes.

- [ ] **Step 2: Run full frontend verification**

Run from `frontend/`:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands pass.

- [ ] **Step 3: Check for remaining inline styling hotspots**

Run from repo root:

```bash
rg "style=\{\{" frontend/src
```

Expected: no matches for page/form layout styling. Recharts-specific inline SVG styles may remain only when required by the chart library or small generated visual elements such as NYHA calendar cells.

- [ ] **Step 4: Review behaviour constraints**

Confirm in diff review:

- No API paths changed.
- No observation save functions changed except surrounding markup/classes.
- No new Save button text appears.
- NYHA documented hex values remain `#22c55e`, `#eab308`, `#f97316`, `#ef4444`.
- Advisory messages and labels remain unchanged.

- [ ] **Step 5: Commit final cleanup if needed**

If Step 1 showed intentional final fixes, run from repo root:

```bash
git add frontend
git commit -m "Polish frontend styling"
```

If Step 1 showed a clean worktree and all previous tasks committed their work, do not create an empty commit.
