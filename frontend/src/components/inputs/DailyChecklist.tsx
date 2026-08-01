import { classes } from '../ui/PageShell'
import type { ChecklistItem } from '../../api/observations'

export function DailyChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <nav aria-label="Readings checklist" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
