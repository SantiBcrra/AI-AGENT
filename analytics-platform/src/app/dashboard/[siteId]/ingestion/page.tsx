'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Header, type Range } from '@/components/layout/header'

type IngestionPayload = {
  site: {
    id: number
    domain: string
    tracking_id: string
    is_active: boolean
  }
  summary: {
    events_last_1h: number
    events_last_24h: number
    events_last_7d: number
    sessions_last_24h: number
    last_event_at: string | null
    first_event_at: string | null
  }
  by_type_24h: { event_type: string; count: number }[]
  recent: {
    id: string
    event_type: string
    path: string
    page_title: string | null
    created_at: string
  }[]
}

export default function IngestionPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [range, setRange] = useState<Range>('28d')
  const [data, setData] = useState<IngestionPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/dashboard/${siteId}/ingestion`)
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`)
      }
      const j = (await r.json()) as IngestionPayload
      setData(j)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [autoRefresh, load])

  const snippet = data && origin
    ? `<script src="${origin}/tracker.js"
  data-site="${data.site.tracking_id}" async></script>`
    : data
      ? `<script src="(tu-dominio-analytics)/tracker.js"
  data-site="${data.site.tracking_id}" async></script>`
      : ''

  return (
    <>
      <Header
        title="Tracker / ingesta"
        subtitle="Comprueba si el pixel guarda eventos en la base de datos"
        siteId={siteId}
        range={range}
        onRange={setRange}
      />

      <div className="p-6 space-y-6 animate-fade-in max-w-5xl">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-300"
            />
            Auto-actualizar cada 15s
          </label>
          <button type="button" onClick={() => { setLoading(true); load() }} className="btn-ghost text-sm">
            Refrescar ahora
          </button>
        </div>

        {loading && !data && (
          <p className="text-sm text-slate-500">Cargando…</p>
        )}

        {error && (
          <div className="card border-nex-coral/40 bg-red-50/50 dark:bg-red-950/20 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {data && (
          <>
            {!data.site.is_active && (
              <div className="card border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 text-sm text-amber-900 dark:text-amber-100">
                Este sitio está <strong>inactivo</strong> en la base: el endpoint{' '}
                <code className="text-xs">/api/collect</code> no aceptará el{' '}
                <code className="text-xs">tracking_id</code>.
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Eventos (1h)', value: data.summary.events_last_1h, color: '#6c1cfc' },
                { label: 'Eventos (24h)', value: data.summary.events_last_24h, color: '#059669' },
                { label: 'Sesiones (24h)', value: data.summary.sessions_last_24h, color: '#007bff' },
                { label: 'Eventos (7d)', value: data.summary.events_last_7d, color: '#d97706' },
              ].map(k => (
                <div key={k.label} className="card">
                  <p className="text-2xl font-bold tabular-nums" style={{ color: k.color }}>
                    {k.value.toLocaleString('es-AR')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{k.label}</p>
                </div>
              ))}
            </div>

            <div className="card space-y-2">
              <h2 className="section-title">Ventana de tiempo</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                <span className="text-slate-500">Primer evento:</span>{' '}
                {data.summary.first_event_at
                  ? new Date(data.summary.first_event_at).toLocaleString('es-AR')
                  : '—'}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                <span className="text-slate-500">Último evento:</span>{' '}
                {data.summary.last_event_at
                  ? new Date(data.summary.last_event_at).toLocaleString('es-AR')
                  : '— (aún no hay datos)'}
              </p>
            </div>

            <div className="card space-y-3">
              <h2 className="section-title">Snippet en el sitio ({data.site.domain})</h2>
              <p className="text-xs text-slate-500">
                El <code>src</code> debe apuntar al mismo host donde está desplegada esta app (o tu dominio
                público de analytics).
              </p>
              <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded-xl overflow-x-auto whitespace-pre-wrap break-all">
                {snippet}
              </pre>
            </div>

            <div className="card space-y-3">
              <h2 className="section-title">Por tipo de evento (24h)</h2>
              {data.by_type_24h.length === 0 ? (
                <p className="text-sm text-slate-500">Sin eventos en las últimas 24 horas.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.by_type_24h.map(row => (
                    <li key={row.event_type} className="flex justify-between text-sm border-b border-surface-border dark:border-dark-border pb-1.5">
                      <code className="text-nex-purple dark:text-nex-lavender">{row.event_type}</code>
                      <span className="font-semibold tabular-nums">{row.count.toLocaleString('es-AR')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card space-y-3">
              <h2 className="section-title">Últimos eventos</h2>
              {data.recent.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No hay filas en <code className="text-xs">events</code> para este sitio. Revisa que el script
                  esté en el sitio público, que <code className="text-xs">data-site</code> coincida con{' '}
                  <code className="text-xs">{data.site.tracking_id}</code> y que el sitio esté activo.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-slate-500 border-b border-surface-border dark:border-dark-border">
                        <th className="py-2 pr-3 font-medium">Hora</th>
                        <th className="py-2 pr-3 font-medium">Tipo</th>
                        <th className="py-2 pr-3 font-medium">Path</th>
                        <th className="py-2 font-medium">Título</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map(row => (
                        <tr key={row.id} className="border-b border-surface-border/60 dark:border-dark-border/60">
                          <td className="py-2 pr-3 whitespace-nowrap text-slate-500">
                            {new Date(row.created_at).toLocaleString('es-AR')}
                          </td>
                          <td className="py-2 pr-3">
                            <code className="text-nex-purple dark:text-nex-lavender">{row.event_type}</code>
                          </td>
                          <td className="py-2 pr-3 max-w-[200px] truncate" title={row.path}>
                            {row.path}
                          </td>
                          <td className="py-2 max-w-[220px] truncate text-slate-600 dark:text-slate-400" title={row.page_title ?? ''}>
                            {row.page_title ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
