'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Header, type Range } from '@/components/layout/header'

type Tab = 'opportunities' | 'top' | 'losing' | 'new'

const TABS: { value: Tab; label: string; icon: string; desc: string }[] = [
  { value: 'opportunities', label: 'Oportunidades', icon: '🎯', desc: 'Listas para mejorar' },
  { value: 'top',           label: 'Top Keywords',  icon: '🏆', desc: 'Más tráfico' },
  { value: 'losing',        label: 'En caída',      icon: '📉', desc: 'Perdiendo posición' },
  { value: 'new',           label: 'Nuevas',        icon: '✨', desc: 'Emergentes' },
]

const OPP_CONFIG: Record<string, { label: string; badge: string; desc: string }> = {
  quick_win:       { label: 'Quick Win',    badge: 'badge-ok',       desc: 'Pos. 4-10, CTR mejorable' },
  high_volume:     { label: 'Alto volumen', badge: 'badge-high',     desc: 'Muchas impresiones' },
  brand:           { label: 'Marca',        badge: 'badge-info',     desc: 'Query de marca' },
  long_tail:       { label: 'Long tail',    badge: 'badge-medium',   desc: 'Alta intención' },
  lost:            { label: 'Perdida',      badge: 'badge-critical', desc: 'Sin clicks' },
  new_opportunity: { label: 'Nueva',        badge: 'badge-new',      desc: 'Apareciendo ahora' },
}

function TrendBadge({ trend, delta }: { trend: string; delta?: number }) {
  if (trend === 'up')     return <span className="delta-up">▲ {delta ? Math.abs(delta) : ''}</span>
  if (trend === 'down')   return <span className="delta-down">▼ {delta ? Math.abs(delta) : ''}</span>
  if (trend === 'new')    return <span className="badge-new text-[10px]">★ Nueva</span>
  if (trend === 'lost')   return <span className="badge-critical text-[10px]">✕ Perdida</span>
  return <span className="text-slate-300 dark:text-slate-600">—</span>
}

function PositionCell({ pos, delta }: { pos: number; delta: number }) {
  const color = pos <= 3 ? '#059669' : pos <= 10 ? '#6c1cfc' : pos <= 20 ? '#d97706' : '#ef4444'
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-bold tabular-nums text-sm" style={{ color }}>{pos.toFixed(1)}</span>
      {delta !== 0 && (
        <span className={`text-[10px] ${delta < 0 ? 'text-emerald-500' : 'text-red-500'}`}>
          {delta < 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(1)}
        </span>
      )}
    </div>
  )
}

function CtrCell({ ctr }: { ctr: number }) {
  const pct = (ctr * 100).toFixed(1)
  const color = ctr >= 0.10 ? '#059669' : ctr >= 0.05 ? '#6c1cfc' : ctr >= 0.02 ? '#d97706' : '#ef4444'
  return <span className="font-semibold tabular-nums text-sm" style={{ color }}>{pct}%</span>
}

function OppBar({ score }: { score: number }) {
  const color = score >= 70 ? '#f95f47' : score >= 50 ? '#8d4afc' : score >= 30 ? '#007bff' : '#b28afd'
  return (
    <div className="flex items-center gap-2">
      <div className="progress-track w-20">
        <div className="progress-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>{score}</span>
    </div>
  )
}

export default function KeywordsPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [range,  setRange]   = useState<Range>('28d')
  const [tab,    setTab]     = useState<Tab>('opportunities')
  const [search, setSearch]  = useState('')
  const [rows,   setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortCol, setSortCol] = useState<string>('opportunity_score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const fetchData = useCallback(() => {
    setLoading(true)
    fetch(`/api/dashboard/${siteId}/keywords?tab=${tab}&search=${encodeURIComponent(search)}`)
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [siteId, tab, search])

  useEffect(() => { fetchData() }, [fetchData])

  const sorted = [...rows].sort((a, b) => {
    const av = parseFloat(a[sortCol] ?? 0)
    const bv = parseFloat(b[sortCol] ?? 0)
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortTh = ({ col, children }: { col: string; children: React.ReactNode }) => (
    <th onClick={() => handleSort(col)}
      className="cursor-pointer select-none hover:text-nex-purple dark:hover:text-nex-lavender transition-colors">
      <div className="flex items-center gap-1">
        {children}
        <span className="text-[10px] opacity-50">
          {sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
        </span>
      </div>
    </th>
  )

  const counts = {
    opportunities: rows.length,
    top: rows.length,
    losing: rows.length,
    new: rows.length,
  }

  return (
    <>
      <Header title="Keywords" subtitle="Análisis y oportunidades de posicionamiento"
        siteId={siteId} range={range} onRange={setRange} />

      <div className="p-6 space-y-5 animate-fade-in">

        {/* ── Tabs ──────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {TABS.map(t => (
            <button key={t.value} onClick={() => setTab(t.value)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                transition-all duration-150 border
                ${tab === t.value
                  ? 'text-white shadow-nex-sm border-transparent'
                  : 'text-slate-500 dark:text-slate-400 border-surface-border dark:border-dark-border bg-white dark:bg-dark-card hover:border-nex-purple/30 hover:text-nex-purple dark:hover:text-nex-lavender'
                }`}
              style={tab === t.value ? { background: 'linear-gradient(135deg,#6c1cfc,#9b5ffd)' } : {}}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── Filtros y búsqueda ────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Buscar keyword..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="search-input" />
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
            {loading ? '...' : `${rows.length} keyword${rows.length !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* ── Tabla principal ───────────────────────────── */}
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="dash-table">
              <thead>
                <tr>
                  <SortTh col="query">Keyword</SortTh>
                  {tab === 'opportunities' && <th>Tipo</th>}
                  <SortTh col="avg_position">Posición</SortTh>
                  <SortTh col="avg_ctr">CTR</SortTh>
                  <SortTh col="total_impressions">Impresiones</SortTh>
                  <SortTh col="total_clicks">Clicks</SortTh>
                  <th>Tendencia</th>
                  {tab === 'opportunities' && <SortTh col="opportunity_score">Score</SortTh>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(tab === 'opportunities' ? 8 : 6)].map((_, j) => (
                        <td key={j}><div className="h-4 skeleton rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center">
                      <div className="text-4xl mb-2">🔍</div>
                      <p className="text-slate-400 dark:text-slate-500 font-medium">
                        {search ? `No hay resultados para "${search}"` : 'No hay keywords para este filtro'}
                      </p>
                    </td>
                  </tr>
                ) : sorted.map((r, i) => {
                  const opp     = OPP_CONFIG[r.opportunity_type]
                  const pos     = parseFloat(r.avg_position ?? 0)
                  const posDelta= parseFloat(r.position_delta ?? 0)
                  const ctr     = parseFloat(r.avg_ctr ?? 0)
                  const clicks  = parseInt(r.total_clicks, 10)
                  const impr    = parseInt(r.total_impressions, 10)
                  const clDelta = parseInt(r.clicks_delta ?? 0, 10)

                  return (
                    <tr key={i}>
                      <td className="max-w-[220px]">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-300 dark:text-slate-600 w-4 shrink-0 tabular-nums">{i+1}</span>
                          <span className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate"
                            title={r.query}>{r.query}</span>
                        </div>
                      </td>
                      {tab === 'opportunities' && (
                        <td>
                          {opp
                            ? <span className={opp.badge} title={opp.desc}>{opp.label}</span>
                            : <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                      )}
                      <td><PositionCell pos={pos} delta={posDelta} /></td>
                      <td><CtrCell ctr={ctr} /></td>
                      <td className="text-right tabular-nums text-sm text-slate-500 dark:text-slate-400">
                        {impr.toLocaleString('es-AR')}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="font-bold tabular-nums text-sm text-slate-800 dark:text-white">
                            {clicks.toLocaleString('es-AR')}
                          </span>
                          {clDelta !== 0 && (
                            <span className={`text-[10px] ${clDelta > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {clDelta > 0 ? '+' : ''}{clDelta}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <TrendBadge trend={r.trend} delta={clDelta} />
                      </td>
                      {tab === 'opportunities' && (
                        <td><OppBar score={parseInt(r.opportunity_score ?? 0, 10)} /></td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {!loading && rows.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3
              border-t border-surface-border dark:border-dark-border">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {rows.length} keywords · Datos de Google Search Console (últimos 28 días)
              </p>
              <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Pos. 1-3
                <span className="w-2 h-2 rounded-full bg-nex-purple ml-2" /> Pos. 4-10
                <span className="w-2 h-2 rounded-full bg-yellow-500 ml-2" /> Pos. 11-20
                <span className="w-2 h-2 rounded-full bg-red-500 ml-2" /> Pos. 20+
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
