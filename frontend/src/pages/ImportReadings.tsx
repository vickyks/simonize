import { useState } from 'react'

import * as importsApi from '../api/imports'
import type { ImportApplyResponse, ImportItem, ImportPreviewResponse } from '../api/imports'
import { PageHeader, PageShell, SectionCard } from '../components/ui/PageShell'

export function ImportReadings({ accessToken }: { accessToken: string }) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null)
  const [result, setResult] = useState<ImportApplyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function previewImport() {
    try {
      setError(null)
      setResult(null)
      setPreview(await importsApi.previewReadingsImport(accessToken, text))
    } catch {
      setError('Could not preview import - please check the pasted text and try again.')
    }
  }

  async function applyImport() {
    if (!preview) return
    try {
      setError(null)
      setResult(await importsApi.applyReadingsImport(accessToken, preview.items))
    } catch {
      setError('Could not import readings - please try again.')
    }
  }

  function toggleOverwrite(item: ImportItem) {
    if (!preview) return
    setPreview({
      ...preview,
      items: preview.items.map((current) => (
        current.row === item.row && current.date === item.date && current.type === item.type
          ? { ...current, overwrite: !current.overwrite }
          : current
      )),
    })
  }

  return (
    <PageShell>
      <PageHeader kicker="Import" title="Import Readings">
        <p>Paste Mum's readings, preview them, then choose exactly what to import.</p>
      </PageHeader>
      <SectionCard>
        <label className="field-label" htmlFor="readings-import">Paste readings</label>
        <textarea id="readings-import" className="input-control mt-2 min-h-56 font-mono" value={text} onChange={(event) => setText(event.target.value)} />
        <button className="btn-primary mt-4" type="button" onClick={() => void previewImport()}>Preview import</button>
        {error ? <p className="mt-3 text-sm font-semibold text-amber-700">{error}</p> : null}
      </SectionCard>
      {preview ? (
        <SectionCard>
          <h2 className="section-title mb-4">Preview</h2>
          <p className="page-copy mb-4">{preview.summary.importable} ready. {preview.summary.conflicts} conflicts. {preview.summary.errors} errors.</p>
          <div className="grid gap-3">
            {preview.rows.map((row) => (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4" key={`row-${row.row}`}>
                <p className="text-sm font-semibold text-amber-800">Row {row.row}{row.message ? '' : `: ${row.date}`}</p>
                {row.message ? <p className="text-sm font-semibold text-amber-700">{row.message}</p> : null}
              </div>
            ))}
            {preview.items.map((item) => (
              <div className="rounded-2xl border border-slate-200 bg-white p-4" key={`${item.row}-${item.date}-${item.type}`}>
                <p className="text-sm font-semibold text-slate-500">{item.date}</p>
                <p className="font-semibold text-slate-900">{item.label}</p>
                <p className="page-copy">{item.incoming_value}</p>
                {item.conflict ? <p className="text-sm font-semibold text-amber-700">Conflict: existing {item.existing_value}</p> : null}
                {item.error ? <p className="text-sm font-semibold text-amber-700">{item.error}</p> : null}
                {item.conflict ? (
                  <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={item.overwrite} onChange={() => toggleOverwrite(item)} />
                    Overwrite {item.label} on {item.date}
                  </label>
                ) : null}
              </div>
            ))}
          </div>
          <button className="btn-primary mt-5" type="button" onClick={() => void applyImport()}>Import readings</button>
        </SectionCard>
      ) : null}
      {result ? (
        <SectionCard>
          <p className="section-title">Imported {result.summary.imported} readings. Skipped {result.summary.skipped}. Errors {result.summary.errors}.</p>
        </SectionCard>
      ) : null}
    </PageShell>
  )
}
