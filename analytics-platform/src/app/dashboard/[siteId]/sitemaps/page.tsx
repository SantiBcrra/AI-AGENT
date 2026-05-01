'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Header, type Range } from '@/components/layout/header'

const STATUS_MAP: Record<string, { badge: string; label: string; icon: string }> = {
  success:    { badge: 'badge-ok',       label: 'Exitoso',    icon: '✅' },
  error:      { badge: 'badge-critical', label: 'Error',      icon: '❌' },
  pending:    { badge: 'badge-info',     label: 'Pendiente',  icon: '⏳' },
  submitted:  { badge: 'badge-medium',   label: 'Enviado',    icon: '📤' },
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return `hace ${Math.floor(diff / 86400)}d`
}

interface SitemapRow {
  id:              number
  sitemap_url:     string
  status:          string
  urls_submitted:  string
  urls_indexed:    string
  warnings_count:  string
  errors_count:    string
  last_submitted:  string
  last_downloaded: string
}

export default function SitemapsPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [range,    setRange]    = useState<Range>('28d')
  const [sitemaps, setSitemaps] = useState<SitemapRow[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/${siteId}/sitemaps`)
      .then(r => r.json())
      .then(d => { setSitemaps(d.rows ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [siteId])

  const totalSubmitted = sitemaps.reduce((a, s) => a + parseInt(s.urls_submitted, 10), 0)
  const totalIndexed   = sitemaps.reduce((a, s) => a + parseInt(s.urls_indexed,   10), 0)
  const totalErrors    = sitemaps.reduce((a, s) => a + parseInt(s.errors_count,   10), 0)
  const indexRate      = totalSubmitted ? Math.round((totalIndexed / totalSubmitted) * 100) : 0

  return (
    <>
      <Header title="Sitemaps" subtitle="Índice de páginas en Google Search Console"
        siteId={siteId} range={range} onRange={setRange} />

      <div className="p-6 space-y-6 animate-fade-in">

        {/* ── KPIs ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'URLs enviadas',  value: totalSubmitted.toLocaleString('es-AR'), color: '#6c1cfc', icon: '📤' },
            { label: 'URLs indexadas', value: totalIndexed.toLocaleString('es-AR'),   color: '#059669', icon: '✅' },
            { label: 'Tasa indexación', value: `${indexRate}%`,                        color: '#007bff', icon: '📊' },
            { label: 'Errores',        value: `${totalErrors}`,                        color: '#ef4444', icon: '❌' },
          ].map(m => (
            <div key={m.label} className="card relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-full"
                style={{ background: `radial-gradient(circle, ${m.color}20 0%, transparent 70%)` }} />
              {loading ? (
                <div className="h-12 skeleton rounded animate-pulse" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${m.color}15` }}>{m.icon}</div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: m.color }}>{m.value}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{m.label}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Index rate bar ───────────────────────────── */}
        {!loading && totalSubmitted > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="section-title">Tasa de indexación global</h3>
                <p className="section-subtitle">URLs indexadas vs. enviadas en todos los sitemaps</p>
              </div>
              <span className="text-2xl font-bold tabular-nums"
                style={{ color: indexRate >= 80 ? '#059669' : indexRate >= 50 ? '#d97706' : '#ef4444' }}>
                {indexRate}%
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden bg-slate-100 dark:bg-dark-muted">
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${indexRate}%`,
                  background: indexRate >= 80
                    ? 'linear-gradient(90deg,#059669,#10b981)'
                    : indexRate >= 50
                      ? 'linear-gradient(90deg,#d97706,#f59e0b)'
                      : 'linear-gradient(90deg,#ef4444,#f87171)',
                }} />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
              <span>{totalIndexed.toLocaleString('es-AR')} indexadas</span>
              <span>{totalSubmitted.toLocaleString('es-AR')} enviadas</span>
            </div>
          </div>
        )}

        {/* ── Sitemaps table ───────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="section-title">Sitemaps</h3>
              <p className="section-subtitle">
                {loading ? '...' : `${sitemaps.length} sitemap${sitemaps.length !== 1 ? 's' : ''} registrado${sitemaps.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>URL del sitemap</th>
                    <th>Estado</th>
                    <th className="text-right">Enviadas</th>
                    <th className="text-right">Indexadas</th>
                    <th className="text-right">Tasa</th>
                    <th className="text-right">Errores</th>
                    <th>Última actualiz.</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(4)].map((_, i) => (
                      <tr key={i}>
                        {[...Array(7)].map((_, j) => (
                          <td key={j}><div className="h-4 skeleton rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : sitemaps.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center">
                        <div className="text-4xl mb-3">🗺️</div>
                        <p className="font-medium text-slate-500 dark:text-slate-400">Sin sitemaps registrados</p>
                        <p className="text-sm text-slate-400 mt-1">Los sitemaps se sincronizarán automáticamente desde GSC</p>
                      </td>
                    </tr>
                  ) : sitemaps.map((s, i) => {
                    const submitted  = parseInt(s.urls_submitted, 10)
                    const indexed    = parseInt(s.urls_indexed,   10)
                    const errors     = parseInt(s.errors_count,   10)
                    const rate       = submitted ? Math.round((indexed / submitted) * 100) : 0
                    const rateColor  = rate >= 80 ? '#059669' : rate >= 50 ? '#d97706' : '#ef4444'
                    const cfg        = STATUS_MAP[s.status] ?? STATUS_MAP.pending
                    const path       = s.sitemap_url.replace(/^https?:\/\/[^/]+/, '')

                    return (
                      <tr key={i}>
                        <td className="max-w-[280px]">
                          <div className="flex items-center gap-2">
                            <span className="text-base shrink-0">🗺️</span>
                            <span className="font-mono text-xs text-slate-600 dark:text-slate-400 truncate"
                              title={s.sitemap_url}>{path}</span>
                          </div>
                        </td>
                        <td>
                          <span className={cfg.badge}>{cfg.icon} {cfg.label}</span>
                        </td>
                        <td className="text-right tabular-nums text-sm text-slate-600 dark:text-slate-400 font-medium">
                          {submitted.toLocaleString('es-AR')}
                        </td>
                        <td className="text-right tabular-nums text-sm font-semibold" style={{ color: '#059669' }}>
                          {indexed.toLocaleString('es-AR')}
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-12 progress-track">
                              <div className="progress-fill" style={{ width: `${rate}%`, background: rateColor }} />
                            </div>
                            <span className="text-xs font-bold tabular-nums" style={{ color: rateColor }}>{rate}%</span>
                          </div>
                        </td>
                        <td className="text-right tabular-nums font-semibold text-red-500">
                          {errors > 0 ? errors : <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                        <td className="text-xs text-slate-400">
                          {s.last_submitted ? timeAgo(s.last_submitted) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
