# Frontend Styling Design

## Context

Simonizer currently has no shared styling foundation. `main.tsx` imports no global CSS, and most UI is either browser default styling or scattered inline styles. This leaves the app visually sparse, black-and-white in many places, and especially weak on form alignment and page structure.

The styling pass should make Simonizer feel professional, calm, and reassuring while preserving its personal recovery focus. It is a visual and layout change only. It must not alter observation behaviour, auto-save semantics, API contracts, or backend-derived view models.

## Visual Direction

Use a Clinical Calm direction:

- Primary tone: professional, readable, restrained, and NHS-adjacent without feeling sterile.
- Palette: slate text and borders, soft blue primary actions and focus states, white cards, pale slate page background.
- Status colours: preserve existing NYHA and advisory semantics from `docs/ux.md`.
- Shape: crisp cards with modest rounding, subtle shadows only where they help hierarchy.
- Density: laptop-first with generous spacing and large tap targets for tired or unwell use.

Use Source Sans 3 as the primary font with a robust sans-serif fallback stack. If the font cannot load, the layout must still be usable and visually acceptable with system fonts.

## Styling Architecture

Add Tailwind to the Vite frontend and import one global stylesheet from `frontend/src/main.tsx`.

Use Tailwind plus a very small local styling layer. Avoid a large component library or broad design system. The app is private and focused, so the styling system should solve the current consistency problem without adding unnecessary abstraction.

Introduce or standardise these small local primitives or class patterns:

- `PageShell`: page background, responsive horizontal padding, max width, and vertical rhythm.
- `SectionCard`: white surface, border, rounded corners, heading spacing, and optional subtle shadow.
- Button patterns: primary, secondary, outline, and subdued/logout variants.
- Form field patterns: label above control, full-width inputs, large tap targets, consistent spacing, visible focus rings.
- Status patterns: historical date banner, advisory banner, save status, and form error text.

Prefer minimal reusable primitives where they reduce repetition across pages. Do not extract components solely for theoretical reuse.

## Page Layouts

### App Header

Create a clean global header with:

- Simonizer wordmark.
- Main navigation links for Dashboard, Today, Charts, and Doctor.
- Current-section styling.
- Subdued logout button.
- Responsive wrapping or stacking on small screens.

### Login

Use a centered login card with:

- Calm welcome copy.
- Full-width username and password fields.
- Clear alert styling for invalid credentials.
- Primary full-width login button.

### Dashboard

Use a structured page intro, advisory banner, and responsive metric card grid.

Metric cards should have consistent typography, borders, spacing, and blue/slate sparklines. The page should feel optimistic and easy to scan, not gamified.

### Daily

Use one calm checklist-led page:

- Checklist first.
- Stacked full-width cards for Vitals, Walk, Guitar, Symptoms, and Notes.
- Inputs aligned and justified inside their sections.
- Large tap targets and clear labels.
- NYHA selector remains four large full-width buttons using documented green/yellow/orange/red semantics.
- Symptoms are presented as a clear grid, with `Good day` visually distinguished.
- Historical date banner remains prominent and amber/yellow.

There must still be no Save button. Auto-save feedback remains per field.

### Charts

Use consistent chart cards, range toggle buttons, and empty states. Preserve Recharts and the existing NYHA calendar colour mapping.

### Doctor

Use a professional screen layout and keep a print stylesheet that:

- Hides navigation, buttons, and non-essential actions.
- Uses black text on white.
- Fits comfortably on A4.
- Keeps report sections readable without relying on colour.

## Behaviour Constraints

This is a styling and layout pass only:

- No API changes.
- No backend changes unless required by build tooling, which is not expected.
- No frontend transformation of raw data.
- No observation save behaviour changes.
- No new Save button.
- No changes to advisory logic or NYHA semantics.
- No unrelated refactoring.

## Testing And Verification

Verify the work with:

- `npm run typecheck`
- `npm run build`
- Existing frontend tests if practical in the current environment.

The implementation should also be manually checked for:

- Login, Dashboard, Daily, Charts, and Doctor pages rendering with the new shared styling.
- Daily form controls aligning cleanly and remaining easy to use.
- Mobile-width layout not overflowing.
- Doctor print styles not leaking into normal screen layout.

## Implementation Scope

This is one focused frontend styling slice. It includes Tailwind setup, global stylesheet import, Source Sans 3 font setup, local layout/form primitives or patterns, and application of those styles to the existing frontend pages and input components.

It does not include redesigning data visualisations beyond card/container styling, adding new product features, or changing backend-generated view models.
