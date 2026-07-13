import type { ChecklistItem } from '../../api/observations'

export function DailyChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <nav aria-label="Daily checklist" style={{ display: 'grid', gap: '0.5rem' }}>
      {items.map((item) => (
        <button
          key={item.type}
          type="button"
          onClick={() => document.getElementById(`section-${item.type}`)?.scrollIntoView({ behavior: 'smooth' })}
          style={{ textAlign: 'left', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.75rem' }}
        >
          {item.recorded ? '✓' : '☐'} {item.label}
        </button>
      ))}
    </nav>
  )
}
