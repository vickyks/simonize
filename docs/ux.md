# Simonizer — UX & Design Rules

## Core principles

- **Laptop-first**, fully responsive down to mobile
- **Large tap targets** — Simon may be tired or unwell
- **Minimal typing** — prefer buttons, checkboxes, number inputs
- **Auto-save** — no Save button exists anywhere
- **Encouraging, not clinical** — celebrate progress, show improvement
- **Never diagnostic** — warnings are observations, not conclusions

---

## NYHA class colours

| Class | Label | Colour | Hex |
|-------|-------|--------|-----|
| I | No symptoms during ordinary activity | Green | `#22c55e` |
| II | Mild limitation | Yellow | `#eab308` |
| III | Marked limitation | Orange | `#f97316` |
| IV | Symptoms at rest | Red | `#ef4444` |

The NYHA selector is **four large buttons** taking up the full width of the input area. The active class is visually distinct (filled background). The others are outlined.

**NYHA is improving when the number goes down.** Charts and trends should reflect this — lower = better.

---

## Symptoms list

Displayed as a checkbox grid. "Good day" should appear last and be visually distinguished (e.g. green border or tick icon).

```
☐  Breathless
☐  Chest discomfort
☐  Palpitations
☐  Swollen ankles
☐  Dizzy
☐  Very tired
☐  Poor sleep
☐  Poor appetite
☑  Good day          ← positive option, styled differently
```

If "Good day" is selected, no negative symptoms should be selectable simultaneously (and vice versa).

---

## Auto-save behaviour

- Triggered on: blur from an input, selection of a button (NYHA, symptoms), debounced 800ms after keystroke in text fields
- Visual feedback: small "Saved ✓" indicator near the field, fades out after 2 seconds
- Error state: "Could not save — will retry" in amber, with retry logic
- No global save spinner — feedback is per-field

---

## Historical date editing

When the user navigates to any date other than today, display a banner at the top of the daily page:

```
┌─────────────────────────────────────────────────────┐
│  ← You are editing Tuesday 24 June 2026             │
└─────────────────────────────────────────────────────┘
```

Styling: amber/yellow background, full width, clearly above the checklist. Includes a "Go to today" link on the right.

---

## Advisory status logic

### Green
All of the following are true (or not enough data to assess):
- No weight increase > 2 kg over 3 days
- Pulse not trending up significantly
- Walk distance not falling over 7 days
- NYHA class not worsening
- No repeated serious symptoms

Display: subtle green indicator, no banner needed.

### Amber — "Possible concern"
Trigger on any of:
- Weight increases ≥ 2 kg over any 3-day window in the last 7 days
- Resting pulse average rises > 10 BPM over 7 days
- Walk distance falls > 20% over 7 days (minimum 3 data points)
- NYHA class worsens by 1 or more for 3+ consecutive days
- Same symptom appears on 3+ of the last 7 days (excluding "good_day")

Display message:
> "Consider contacting the Heart Failure team if this continues."

Never say: "You are retaining fluid" / "Your heart is struggling" / "This is dangerous"

### Red — "Potentially serious"
Trigger on any of:
- "Chest discomfort" symptom recorded today
- NYHA IV recorded today
- Weight increases ≥ 3 kg over 2 days

Display message:
> "If symptoms are severe or sudden, call 999. Otherwise contact the Heart Failure team urgently."

**Red is a safety feature, not a diagnosis.** The UI should make calling for help easy (display a phone number if configured), but must never claim to know what is medically happening.

---

## Dashboard layout

```
┌──────────┬──────────┬──────────┬──────────┐
│  Weight  │  Pulse   │    BP    │   Walk   │
│  92.3 kg │  71 bpm  │ 121 / 78 │  325 m   │
│  ↓ trend │  ↓ trend │  stable  │  ↑ trend │
└──────────┴──────────┴──────────┴──────────┘
┌──────────┬──────────┬──────────────────────┐
│  Songs   │   NYHA   │   Advisory Status    │
│  3 today │  Class 3 │  🟡 Possible concern  │
└──────────┴──────────┴──────────────────────┘
┌────────────────────────────────────────────┐
│  Milestones                                │
│  🏅 Longest walk ever: 325 m (today)       │
│  🏅 First symptom-free day: 18 June        │
└────────────────────────────────────────────┘
```

---

## Charts

### General rules
- All charts use **Recharts**
- Time axis: dates on X, values on Y
- Tooltip on hover showing date + value
- Target line shown where a target exists (dashed line)
- Empty state: "No data yet — start recording to see your progress"

### NYHA calendar (contribution graph)

Inspired by GitHub's contribution graph. One cell per day, coloured by NYHA class:

| NYHA | Cell colour |
|------|-------------|
| I | `#22c55e` (green) |
| II | `#eab308` (yellow) |
| III | `#f97316` (orange) |
| IV | `#ef4444` (red) |
| No data | `#e5e7eb` (light grey) |

Layout: weeks across X axis, days of week on Y. Most recent week on the right. Show at least 12 weeks.

Goal: the calendar should become **gradually greener** as Simon recovers.

---

## Milestones — tone guidance

Milestones should feel like a friend noticing something good, not a fitness app badge.

✅ "You walked 325 metres today — your furthest yet."
✅ "Seven days of stable weight. That's really encouraging."
✅ "You've had your first symptom-free day."

❌ "ACHIEVEMENT UNLOCKED: 325m Walk"
❌ "You earned the Heart Hero badge!"
❌ "Level up!"

---

## Checklist (daily page)

Displayed at the top of the daily page. Each item ticks when its observation is saved.

```
Today's Recovery — Saturday 28 June

✓ Weight           recorded
✓ Blood Pressure   recorded
☐ Pulse            —
☐ Walk             —
☐ Guitar           —
☐ NYHA             —
☐ Symptoms         —
☐ Notes            —
```

Clicking a checklist item scrolls to that section.

Note: "Guitar" maps to the `songs` observation type. The checklist label is "Guitar" to match Simon's context.

---

## Print / Doctor view styles

The doctor view (`/doctor`) should have a print stylesheet that:
- Hides navigation, buttons, and advisory colours
- Uses black text on white
- Includes the date range at the top
- Fits comfortably on A4
- Keeps all charts (rendered as static SVG / canvas snapshot)
