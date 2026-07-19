import { cloneElement, isValidElement } from 'react'
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
      {children ? (
        isValidElement<{ className?: string }>(children) ? (
          cloneElement(children, { className: classes('page-copy', children.props.className) })
        ) : (
          <div className="page-copy">{children}</div>
        )
      ) : null}
    </section>
  )
}

export function SectionCard({ children, className, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={classes('section-card', className)} {...props}>
      {children}
    </section>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-slate-500">
      {children}
    </p>
  )
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
