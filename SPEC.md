# Simonizer

### Personal Cardiac Recovery Tracker

**Version:** MVP v1.0

---

# 1. Vision

Simonizer is a private web application designed to help Simon and his family monitor his recovery following heart failure and atrial fibrillation.

The application is **not** intended to provide medical advice or make diagnoses. Instead, it provides an easy way to record daily observations, visualise long-term recovery and identify trends that may warrant discussion with the Heart Failure team.

The guiding principle of the application is:

> **Is Simon getting better?**

Every feature should help answer that question.

---

# 2. Goals

## Primary goals

* Make daily recording effortless.
* Allow observations to be entered throughout the day.
* Make long-term progress obvious.
* Produce useful summaries for medical appointments.
* Encourage recovery through milestones and visual progress.

## Non-goals

* Medication management.
* Appointment scheduling.
* Medical diagnosis.
* Multiple patients.
* NHS integration.
* Wearables.

---

# 3. Users

Single patient.

Single household login.

Future multi-user support is intentionally out of scope.

---

# 4. Technology

Backend

* Python
* FastAPI
* SQLAlchemy / SQLModel
* PostgreSQL
* Alembic
* JWT Authentication

Frontend

* React
* TypeScript
* Vite
* React Query
* React Hook Form
* Recharts

Deployment

Docker Compose

Nginx reverse proxy

Hosted on:

simonizer.vickystephens.co.uk

---

# 5. Data Model

The system is observation-driven.

Instead of storing "a daily record", every metric is stored independently.

Example

2026-06-27

Weight = 92.3kg

Resting Pulse = 71

Blood Pressure = 121 / 78

Walk Distance = 325m

Songs = 3

NYHA = III

Symptoms = Breathless

Notes = Felt stronger today

The daily page is simply a view over the observations for a particular date.

Benefits

* Partial saves
* Future multiple walks
* Future multiple BP readings
* Better audit trail
* Easier extensions

---

# 6. Observation Types

Weight

Resting Pulse

Blood Pressure

Walk Distance

Walk Time

Stops

Songs

NYHA

Symptoms

Notes

---

# 7. Daily Workflow

Landing page:

Today's Recovery

Checklist

☐ Weight

☐ Blood Pressure

☐ Pulse

☐ Walk

☐ Guitar

☐ NYHA

☐ Symptoms

☐ Notes

Each section saves independently.

No Save button.

Saving is automatic.

Past dates can be edited.

Editing a historical date displays a clear banner:

"You are editing Tuesday 24 June."

---

# 8. Measurements

Weight

kg

One per day.

Blood Pressure

Two numeric inputs

SYS / DIA

Example

121 / 78

Resting Pulse

One value

BPM

Walk

Distance (metres)

Time

Stops

Future support:

Multiple walks

Routes

Maps

Songs

Number of songs played continuously.

Self-assessed quality.

NYHA

Large colour-coded buttons.

I

No symptoms during ordinary activity

Green

II

Mild limitation

Yellow

III

Marked limitation

Orange

IV

Symptoms at rest

Red

Notes

Free text.

Symptoms

Checkboxes.

---

# 9. Symptoms

Recommended list

Breathless

Chest discomfort

Palpitations

Swollen ankles

Dizzy

Very tired

Poor sleep

Poor appetite

Good day

---

# 10. Dashboard

The dashboard is the heart of Simonizer.

It should be attractive and encouraging.

Cards

Weight

Pulse

Blood Pressure

Today's Walk

Today's Songs

Current NYHA

Recovery Status

Milestones

Charts

Weight

Pulse

Blood Pressure

Walk Distance

Walk Time

Songs

NYHA Calendar

The NYHA chart should resemble GitHub's contribution graph.

Recovery gradually becomes greener.

---

# 11. Targets

Global goals.

Examples

Walk

500 metres

Songs

5 songs

Weight

Maintain stability

NYHA

II

Targets are editable.

No dates.

---

# 12. Milestones

Examples

Longest walk

Most songs

Lowest resting pulse

Weight stable 7 days

Weight stable 30 days

First NYHA III

First NYHA II

First symptom-free day

100 observations recorded

30 consecutive days

Milestones should feel encouraging rather than gamified.

---

# 13. Advisory Status

The application provides advisory feedback only.

Green

Everything appears stable.

Amber

Possible concern.

Examples

Weight increase

Pulse increase

Walk distance falls

NYHA worsens

Repeated symptoms

Display

"Consider contacting the Heart Failure team if this continues."

Red

Potentially serious symptoms.

Examples

Chest pain

Severe breathlessness

Collapse

Display

"If symptoms are severe or sudden, call 999. Otherwise contact the Heart Failure team urgently."

No diagnosis is ever given.

---

# 14. Doctor View

A simplified page.

Last 7 days

Last 30 days

Weight trend

Pulse trend

Blood pressure trend

Walk progression

Songs progression

NYHA trend

Symptoms

Notes

Designed for printing.

---

# 15. Authentication

Single user.

Username

Password

JWT authentication.

---

# 16. UX Principles

Laptop-first.

Responsive.

Large buttons.

Minimal typing.

Everything editable.

Automatic saving.

No spreadsheet as the primary interface.

Recovery should feel encouraging rather than clinical.

---

# 17. Future Ideas (Out of Scope)

Medication tracking

Medication reminders

Notifications

Route mapping

Multiple walks

Google Maps integration

Wearables

Apple Health

Google Fit

Doctor portal

Family accounts

PDF exports

CSV imports

AI-generated weekly summaries

Voice entry

Photo uploads

---

# 18. Architecture

React SPA

↓

FastAPI REST API

↓

PostgreSQL

↓

Docker Compose

↓

Nginx

All communication is via JSON REST endpoints.

Authentication via JWT.

The frontend should never communicate directly with the database.

---

# 19. Success Criteria


Simon and his wife can complete a day's observations in under two minutes.

Recovery trends are immediately obvious.

Doctor appointments are supported by clear historical data.

The application feels optimistic, personal and simple to use.

Most importantly, Simon can clearly see that he is making progress.


20. Architecture Principles

Simonizer should be designed around a small set of core principles that allow the application to evolve without requiring significant redesign.

Observation-first architecture

The application does not fundamentally store "daily records".

Instead, it stores observations that happen to be associated with a day.

For example:

Observation
-----------
id
date
type
value
metadata

Examples:

2026-06-27
weight = 92.3

2026-06-27
pulse = 71

2026-06-27
bp = 121/78

2026-06-27
walk_distance = 325

2026-06-27
songs = 3

The "Daily Recovery" page is simply a projection over all observations for a given day.

This allows future support for:

multiple walks
multiple blood pressure readings
medication observations
oxygen saturation
sleep quality
wearable integrations

without changing the overall architecture.

Everything is appendable

New observation types should require minimal work.

Adding a new metric should ideally involve only:

adding a new ObservationType
adding validation
adding a frontend component
optionally adding a chart

The database schema should not require redesign.

Derived data is never stored

The application should calculate rather than persist:

milestones
advisory status
trends
averages
longest walk
current streak
recovery score

Only raw observations are stored.

Everything else is derived.

Services own business logic

Business rules should live in service classes rather than API routes.

Example:

ObservationService

DashboardService

AchievementService

WarningService

SummaryService

The API should remain intentionally thin.

Charts consume view models

The frontend should never transform raw observations into chart datasets.

The backend should expose purpose-built endpoints such as:

/dashboard

/charts/walk

/charts/pulse

/charts/weight

/charts/nyha

This keeps the frontend simple and makes visualisations easy to evolve.

21. Engineering Principles
Optimise for Simon, not generic users.

Every design decision should ask:

"Does this make recovery easier for Simon?"

rather than:

"Would this work for thousands of users?"

Prefer simplicity over flexibility.

This application is intentionally single-patient.

Avoid introducing abstractions solely to support future multi-patient use.

When requirements genuinely change, evolve the design rather than anticipating every possibility.

Build incrementally.

Every completed iteration should leave the application usable.

Suggested milestones:

Login
Daily observations
Dashboard
Charts
Doctor View
Achievements
Advisory warnings
Automatic saving.

The user should never wonder whether changes have been saved.

Observations should save immediately after editing, with unobtrusive visual feedback.

Minimise typing.

Wherever possible use:

buttons
sliders (only if genuinely helpful)
checkboxes
number inputs
selectable targets

Typing should primarily be reserved for notes.

Recovery should feel encouraging.

The application should celebrate progress.

Good visualisations are more valuable than large quantities of data.

Whenever possible, show improvement rather than simply displaying numbers.

Make progress visible.

The application should answer questions like:

"Is Simon walking further?"

"Has his pulse settled?"

"Are symptom-free days becoming more common?"

rather than simply listing measurements.

Medical safety.

Simonizer is not a medical device.

It must never claim to diagnose or recommend treatment.

Warnings should always be phrased as observations.

For example:

✓ "Your weight has increased by 2 kg over three days."

✗ "You are retaining fluid."

The application may recommend contacting the Heart Failure team or, where appropriate, calling 999 for severe symptoms, but it must not present itself as making clinical decisions.

Keep the code pleasant.

Prefer readable code over clever code.

Optimise for maintainability.

A future version of Simonizer should feel like extending an existing application, not rewriting one.
