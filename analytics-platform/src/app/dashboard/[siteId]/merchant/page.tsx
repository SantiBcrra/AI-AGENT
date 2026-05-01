'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Header, type Range } from '@/components/layout/header'

const STATUS_MAP: Record<string, { badge: string; label: string; icon: string }> = {
  approved:   { badge: 'badge-ok',       label: 'Aprobado',   icon: '✅' },
  pending:    { badge: 'badge-medium',   label: 'Pendiente',  icon: '⏳' },
  disapproved:{ badge: 'badge-critical', label: 'Rechazado',  icon: '❌' },
  warning:    { badge: 'badge-high',     label: 'Advertencia',icon: '⚠️' },
}

const LISTING_TYPES: Record<string, { label: string; icon: string }> = {
  product:  { label: 'Producto',   icon: '🛍️' },
  review:   { label: 'Reseña',     icon: '⭐' },
  merchant: { label: 'Merchant',   icon: '🏪' },
}

interface MerchantListing {
  id:             number
  page_url:       string
  listing_type:   string
  product_name:   string
  status:         string
  price:          string | null
  currency:       string | null
  availability:   string | null
  issues:         string
  last_checked:   string
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return `hace ${Math.floor(diff / 86400)}d`
}

export default function MerchantPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [range,    setRange]    = useState<Range>('28d')
  const [listings, setListings] = useState<MerchantListing[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<string>('all')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/${siteId}/merchant`)
      .then(r => r.json())
      .then(d => { setListings(d.rows ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [siteId])

  const filtered = listings.filter(l => {
    const matchSearch = !search
      || l.product_name?.toLowerCase().includes(search.toLowerCase())
      || l.page_url.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || l.status === filter
    return matchSearch && matchFilter
  })

  const approved    = listings.filter(l => l.status === 'approved').length
  const disapproved = listings.filter(l => l.status === 'disapproved').length
  const pending     = listings.filter(l => l.status === 'pending').length

  return (
    <>
      <Header title="Merchant & Fichas" subtitle="Productos y fichas de Google"
        siteId={siteId} range={range} onRange={setRange} />

      <div className="p-6 space-y-6 animate-fade-in">

        {/* ── KPIs ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Total fichas',  value: listings.length, color: '#6c1cfc', icon: '🏪' },
            { label: 'Aprobadas',     value: approved,        color: '#059669', icon: '✅' },
            { label: 'Rechazadas',    value: disapproved,     color: '#ef4444', icon: '❌' },
            { label: 'Pendientes',    value: pending,         color: '#d97706', icon: '⏳' },
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

        {/* ── Filters ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Buscar producto o URL..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="search-input" />
          </div>
          <div className="flex gap-1.5">
            {[
              { value: 'all',         label: 'Todos' },
              { value: 'approved',    label: 'Aprobados' },
              { value: 'disapproved', label: 'Rechazados' },
              { value: 'pending',     label: 'Pendientes' },
            ].map(f => (
              <button key={f.value}
                onClick={() => setFilter(f.value)}
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
          <p className="text-xs text-slate-400 shrink-0">
            {loading ? '...' : `${filtered.length} ficha${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* ── Listings table ───────────────────────────── */}
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Producto / URL</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Precio</th>
                  <th>Disponibilidad</th>
                  <th>Revisado</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(6)].map((_, j) => (
                        <td key={j}><div className="h-4 skeleton rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="text-4xl mb-3">🏪</div>
                      <p className="font-medium text-slate-500 dark:text-slate-400">
                        {search || filter !== 'all' ? 'Sin resultados para ese filtro' : 'Sin fichas de merchant'}
                      </p>
                      <p className="text-sm text-slate-400 mt-1">
                        Las fichas se sincronizarán automáticamente desde la inspección de URLs
                      </p>
                    </td>
                  </tr>
                ) : filtered.map((listing, i) => {
                  const type   = LISTING_TYPES[listing.listing_type] ?? { label: listing.listing_type, icon: '📄' }
                  const status = STATUS_MAP[listing.status]          ?? STATUS_MAP.pending
                  const path   = listing.page_url.replace(/^https?:\/\/[^/]+/, '') || '/'

                  const parsedIssues = (() => {
                    try { return JSON.parse(listing.issues ?? '[]') } catch { return [] }
                  })()

                  return (
                    <tr key={i}>
                      <td className="max-w-[240px]">
                        <p className="font-medium text-slate-800 dark:text-white text-sm truncate"
                          title={listing.product_name}>{listing.product_name || '—'}</p>
                        <p className="font-mono text-[10px] text-slate-400 truncate mt-0.5" title={listing.page_url}>
                          {path}
                        </p>
                        {parsedIssues.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {parsedIssues.slice(0, 2).map((iss: any, j: number) => (
                              <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium">
                                {iss.field ?? iss.code ?? 'Error'}
                              </span>
                            ))}
                            {parsedIssues.length > 2 && (
                              <span className="text-[10px] text-slate-400">+{parsedIssues.length - 2}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge-info">{type.icon} {type.label}</span>
                      </td>
                      <td>
                        <span className={status.badge}>{status.icon} {status.label}</span>
                      </td>
                      <td className="tabular-nums text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {listing.price
                          ? `${listing.currency ?? ''} ${parseFloat(listing.price).toLocaleString('es-AR')}`.trim()
                          : <span className="text-slate-300 dark:text-slate-600">—</span>
                        }
                      </td>
                      <td>
                        {listing.availability ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                            ${listing.availability === 'in_stock'
                              ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                              : 'text-red-500 bg-red-50 dark:bg-red-900/20'
                            }`}>
                            {listing.availability === 'in_stock' ? '✓ Stock' : 'Sin stock'}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="text-xs text-slate-400">
                        {listing.last_checked ? timeAgo(listing.last_checked) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  )
}
