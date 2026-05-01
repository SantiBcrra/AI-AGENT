'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Header, type Range } from '@/components/layout/header'

const TYPE_LABELS: Record<string, string> = {
  product:        'Productos',
  review:         'Reseñas',
  breadcrumb:     'Breadcrumbs',
  video:          'Videos',
  faq:            'FAQ',
  howto:          'How-to',
  event:          'Eventos',
  recipe:         'Recetas',
  article:        'Artículos',
  local_business: 'Negocio local',
  sitelinks:      'Sitelinks',
  merchant:       'Merchant',
}

const TYPE_ICONS: Record<string, string> = {
  product:        '🛍️',
  review:         '⭐',
  breadcrumb:     '🗂️',
  video:          '🎬',
  faq:            '❓',
  howto:          '📋',
  event:          '📅',
  recipe:         '🍳',
  article:        '📰',
  local_business: '📍',
  sitelinks:      '🔗',
  merchant:       '🏪',
}

const STATUS_MAP: Record<string, { badge: string; label: string }> = {
  valid:               { badge: 'badge-ok',       label: 'Válido' },
  valid_with_warnings: { badge: 'badge-medium',   label: 'Con avisos' },
  error:               { badge: 'badge-critical', label: 'Error' },
  not_detected:        { badge: 'badge-info',     label: 'Sin markup' },
  excluded:            { badge: 'badge-high',     label: 'Excluido' },
}

interface SummaryRow {
  result_type:    string
  valid:          string
  warnings:       string
  errors:         string
  not_detected:   string
  total:          string
  last_inspected: string
}

interface IssueRow {
  page_url:       string
  result_type:    string
  status:         string
  errors_count:   string
  warnings_count: string
  issues:         string
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { badge: 'badge-info', label: status }
  return <span className={cfg.badge}>{cfg.label}</span>
}

function StatCard({ value, label, color, icon }: { value: number; label: string; color: string; icon: string }) {
  return (
    <div className="card relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-20 h-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-full"
        style={{ background: `radial-gradient(circle, ${color}20 0%, transparent 70%)` }} />
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={{ background: `${color}15` }}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  )
}

export default function RichResultsPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [range,    setRange]    = useState<Range>('28d')
  const [summary,  setSummary]  = useState<SummaryRow[]>([])
  const [issues,   setIssues]   = useState<IssueRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter,   setFilter]   = useState<'all' | 'error' | 'warning'>('all')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/${siteId}/rich-results`)
      .then(r => r.json())
      .then(d => {
        setSummary(d.summary ?? [])
        setIssues(d.issues   ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [siteId])

  const totalErrors   = summary.reduce((a, r) => a + parseInt(r.errors,   10), 0)
  const totalWarnings = summary.reduce((a, r) => a + parseInt(r.warnings, 10), 0)
  const totalValid    = summary.reduce((a, r) => a + parseInt(r.valid,    10), 0)
  const totalAll      = totalErrors + totalWarnings + totalValid

  const filteredIssues = issues.filter(i => {
    if (filter === 'error')   return parseInt(i.errors_count, 10) > 0
    if (filter === 'warning') return parseInt(i.warnings_count, 10) > 0 && parseInt(i.errors_count, 10) === 0
    return true
  })

  return (
    <>
      <Header title="Rich Results" subtitle="Fragmentos enriquecidos en Google Search"
        siteId={siteId} range={range} onRange={setRange} />

      <div className="p-6 space-y-6 animate-fade-in">

        {/* ── KPI row ─────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {loading ? (
            [...Array(4)].map((_, i) => <div key={i} className="card h-20 animate-pulse skeleton" />)
          ) : (
            <>
              <StatCard value={totalAll}    label="Tipos inspeccionados" color="#6c1cfc" icon="🔍" />
              <StatCard value={totalValid}  label="Válidos"              color="#059669" icon="✅" />
              <StatCard value={totalWarnings} label="Con advertencias"   color="#d97706" icon="⚠️" />
              <StatCard value={totalErrors} label="Con errores"          color="#ef4444" icon="❌" />
            </>
          )}
        </div>

        {/* ── Estado por tipo ────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="section-title">Estado por tipo</h3>
              <p className="section-subtitle">Cobertura de rich results detectada</p>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="card h-28 animate-pulse skeleton" />
              ))}
            </div>
          ) : summary.length === 0 ? (
            <div className="card py-16 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <p className="font-medium text-slate-600 dark:text-slate-400">Sin datos de inspección</p>
              <p className="text-sm text-slate-400 mt-1">Ejecuta el cron de inspección de URLs primero</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {summary.map(row => {
                const errors   = parseInt(row.errors,   10)
                const warnings = parseInt(row.warnings, 10)
                const valid    = parseInt(row.valid,    10)
                const total    = parseInt(row.total,    10) || 1
                const isActive = expanded === row.result_type

                const borderColor = errors > 0   ? 'border-red-200 dark:border-red-800/40'
                  : warnings > 0 ? 'border-yellow-200 dark:border-yellow-800/40'
                  : 'border-emerald-200 dark:border-emerald-800/30'

                const glowColor = errors > 0   ? 'rgba(239,68,68,0.08)'
                  : warnings > 0 ? 'rgba(217,119,6,0.08)'
                  : 'rgba(5,150,105,0.08)'

                return (
                  <div key={row.result_type}
                    onClick={() => setExpanded(isActive ? null : row.result_type)}
                    className={`card border cursor-pointer transition-all duration-200 hover:shadow-nex-md
                      ${borderColor} ${isActive ? 'ring-2 ring-nex-purple/30' : ''}`}
                    style={isActive ? { background: glowColor } : {}}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{TYPE_ICONS[row.result_type] ?? '📄'}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 text-sm leading-tight">
                        {TYPE_LABELS[row.result_type] ?? row.result_type}
                      </span>
                    </div>

                    {/* Segmented bar */}
                    <div className="h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-dark-muted mb-3">
                      <div className="h-full flex">
                        <div className="bg-emerald-500 transition-all" style={{ width: `${(valid / total) * 100}%` }} />
                        <div className="bg-yellow-500 transition-all" style={{ width: `${(warnings / total) * 100}%` }} />
                        <div className="bg-red-500 transition-all"    style={{ width: `${(errors / total) * 100}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      {valid > 0 && (
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />{valid}
                        </span>
                      )}
                      {warnings > 0 && (
                        <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />{warnings}
                        </span>
                      )}
                      {errors > 0 && (
                        <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />{errors}
                        </span>
                      )}
                    </div>

                    {row.last_inspected && (
                      <p className="text-[10px] text-slate-400 mt-2 truncate">
                        Insp. {new Date(row.last_inspected).toLocaleDateString('es-AR')}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── URLs con problemas ─────────────────────── */}
        {(loading || issues.length > 0) && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="section-title">URLs con problemas</h3>
                <p className="section-subtitle">
                  {loading ? '...' : `${filteredIssues.length} URL${filteredIssues.length !== 1 ? 's' : ''} con issues`}
                </p>
              </div>

              {/* Filter pills */}
              {!loading && (
                <div className="flex gap-1.5">
                  {[
                    { value: 'all',     label: 'Todos' },
                    { value: 'error',   label: 'Errores' },
                    { value: 'warning', label: 'Avisos' },
                  ].map(f => (
                    <button key={f.value}
                      onClick={() => setFilter(f.value as typeof filter)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
                        ${filter === f.value
                          ? 'text-white border-transparent shadow-nex-sm'
                          : 'text-slate-500 border-surface-border dark:border-dark-border bg-white dark:bg-dark-card hover:border-nex-purple/30'
                        }`}
                      style={filter === f.value ? { background: 'linear-gradient(135deg,#6c1cfc,#9b5ffd)' } : {}}>
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>URL</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th className="text-right">Errores</th>
                      <th className="text-right">Avisos</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      [...Array(5)].map((_, i) => (
                        <tr key={i}>
                          {[...Array(6)].map((_, j) => (
                            <td key={j}><div className="h-4 skeleton rounded" /></td>
                          ))}
                        </tr>
                      ))
                    ) : filteredIssues.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center">
                          <div className="text-3xl mb-2">✅</div>
                          <p className="text-slate-400 dark:text-slate-500 font-medium">Sin problemas detectados</p>
                        </td>
                      </tr>
                    ) : filteredIssues.map((issue, i) => {
                      const parsedIssues = (() => { try { return JSON.parse(issue.issues) } catch { return [] } })()
                      const isOpen = expanded === `issue-${i}`
                      const errCount = parseInt(issue.errors_count,   10)
                      const wrnCount = parseInt(issue.warnings_count, 10)
                      const path = issue.page_url.replace(/^https?:\/\/[^/]+/, '') || '/'

                      return (
                        <>
                          <tr key={i} className={`cursor-pointer ${isOpen ? 'bg-nex-ghost dark:bg-dark-muted' : ''}`}
                            onClick={() => setExpanded(isOpen ? null : `issue-${i}`)}>
                            <td className="max-w-[260px]">
                              <span className="font-mono text-xs text-slate-600 dark:text-slate-400 truncate block"
                                title={issue.page_url}>{path}</span>
                            </td>
                            <td>
                              <span className="badge-info">
                                {TYPE_ICONS[issue.result_type] ?? '📄'} {TYPE_LABELS[issue.result_type] ?? issue.result_type}
                              </span>
                            </td>
                            <td><StatusPill status={issue.status} /></td>
                            <td className="text-right tabular-nums font-semibold text-red-500">
                              {errCount > 0 ? errCount : <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </td>
                            <td className="text-right tabular-nums font-semibold text-yellow-600 dark:text-yellow-500">
                              {wrnCount > 0 ? wrnCount : <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </td>
                            <td className="text-right">
                              <span className={`text-xs transition-transform inline-block ${isOpen ? 'rotate-90' : ''} text-slate-400`}>›</span>
                            </td>
                          </tr>

                          {isOpen && parsedIssues.length > 0 && (
                            <tr key={`detail-${i}`}>
                              <td colSpan={6} className="bg-nex-ghost dark:bg-dark-muted px-6 py-4">
                                <div className="space-y-2">
                                  {parsedIssues.map((iss: any, j: number) => (
                                    <div key={j} className="flex items-start gap-2.5 text-xs p-2.5 rounded-lg
                                      bg-white dark:bg-dark-card border border-surface-border dark:border-dark-border">
                                      <span className={`mt-0.5 shrink-0 font-bold
                                        ${iss.type === 'error' ? 'text-red-500' : 'text-yellow-500'}`}>
                                        {iss.type === 'error' ? '✗' : '⚠'}
                                      </span>
                                      <div className="min-w-0">
                                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                                          {iss.field ?? iss.code}
                                        </span>
                                        {iss.message && (
                                          <span className="ml-2 text-slate-500 dark:text-slate-400">{iss.message}</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && issues.length === 0 && summary.length > 0 && (
          <div className="card py-12 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <p className="font-semibold text-slate-700 dark:text-slate-300">Sin URLs con problemas</p>
            <p className="text-sm text-slate-400 mt-1">Todos los rich results están correctamente implementados</p>
          </div>
        )}

      </div>
    </>
  )
}
