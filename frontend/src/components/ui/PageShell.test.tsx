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
    expect(screen.getByText('Recovery picture').parentElement).toHaveClass('page-copy')
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
