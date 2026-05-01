'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Header, type Range } from '@/components/layout/header'
import { MetricCard }   from '@/components/widgets/metric-card'
import { TrafficChart } from '@/components/Charts/traffic-chart'
import { DeviceChart }  from '@/components/Charts/device-chart'

/* ── Mini ícono SVG ─────────────────────────────────────── */
function Ico({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

/* ── Source pill ────────────────────────────────────────── */
const SRC_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  google:     { bg: '#4285F410', color: '#4285F4', label: 'Google' },
  facebook:   { bg: '#1877F210', color: '#1877F2', label: 'Facebook' },
  instagram:  { bg: '#E1306C10', color: '#E1306C', label: 'Instagram' },
  twitter:    { bg: '#1DA1F210', color: '#1DA1F2', label: 'X / Twitter' },
  direct:     { bg: '#6c1cfc10', color: '#6c1cfc', label: 'Directo' },
  bing:       { bg: '#00897B10', color: '#00897B', label: 'Bing' },
  duckduckgo: { bg: '#DE5833 10', color: '#DE5833', label: 'DuckDuckGo' },
  referral:   { bg: '#f95f4710', color: '#f95f47', label: 'Referral' },
}

function HealthRow({ label, count, type, href }: {
  label: string; count: number; type: 'ok' | 'warn' | 'error'; href: string
}) {
  const cfg = {
    ok:    { badge: 'badge-ok',       dot: 'health-dot-ok',    text: 'OK' },
    warn:  { badge: 'badge-medium',   dot: 'health-dot-warn',  text: `${count} advertencia${count !== 1 ? 's' : ''}` },
    error: { badge: 'badge-critical', dot: 'health-dot-error', text: `${count} error${count !== 1 ? 'es' : ''}` },
  }[type]

  return (
    <a href={href} className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-lg
      hover:bg-nex-ghost dark:hover:bg-dark-muted transition-colors">
      <div className="flex items-center gap-2">
        <span className={cfg.dot} />
        <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      </div>
      <span className={cfg.badge}>{type === 'ok' ? 'OK' : cfg.text}</span>
    </a>
  )
}

export default function OverviewPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [range, setRange]   = useState<Range>('28d')
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/${siteId}/overview?range=${range}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [siteId, range])

  const m  = data?.metrics  ?? {}
  const dv = data?.devices  ?? {}
  const h  = data?.health   ?? {}

  const fmtDuration = (s: number) =>
    s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '0:00'

  return (
    <>
      <Header title="Overview" subtitle="Resumen general del sitio"
        siteId={siteId} range={range} onRange={setRange} />

      <div className="p-6 space-y-6 animate-fade-in">

        {/* ── KPI row ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard label="Visitas únicas" value={m.visits ?? 0}
            delta={m.visitsDelta} deltaLabel="vs período anterior"
            accent="purple" loading={loading}
            icon={<Ico d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />} />
          <MetricCard label="Pageviews" value={m.pageviews ?? 0}
            accent="violet" loading={loading}
            icon={<Ico d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />} />
          <MetricCard label="Bounce Rate" value={m.bounceRate ?? 0} suffix="%"
            accent="coral" loading={loading}
            icon={<Ico d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />} />
          <MetricCard label="Tiempo promedio" value={fmtDuration(m.avgDuration ?? 0)}
            accent="navy" loading={loading}
            subValue="por sesión"
            icon={<Ico d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />} />
        </div>

        {/* ── GSC KPIs ──────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Clicks GSC', key: 'gsc_clicks',      accent: 'blue'   as const, icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5' },
            { label: 'Impresiones', key: 'gsc_impressions', accent: 'violet' as const, icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
            { label: 'CTR promedio', key: 'gsc_ctr',        accent: 'green'  as const, icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
            { label: 'Posición media', key: 'gsc_position', accent: 'navy'  as const, icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
          ].map(({ label, key, accent, icon }) => (
            <MetricCard key={key} label={label}
              value={loading ? 0 : key === 'gsc_ctr'
                ? `${(m[key] ?? 0).toFixed(1)}%`
                : key === 'gsc_position'
                  ? (m[key] ?? 0).toFixed(1)
                  : (m[key] ?? 0).toLocaleString('es-AR')}
              accent={accent} loading={loading}
              subValue="Google Search Console"
              icon={<Ico d={icon} />} />
          ))}
        </div>

        {/* ── Gráfico + Dispositivos ──────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="xl:col-span-3 min-h-[300px]">
            <TrafficChart data={data?.chartData ?? []} loading={loading} />
          </div>
          <DeviceChart desktop={dv.desktop ?? 0} mobile={dv.mobile ?? 0} tablet={dv.tablet ?? 0} loading={loading} />
        </div>

        {/* ── Fuentes + Top páginas + Panel lateral ────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Fuentes de tráfico */}
          <div className="card">
            <div className="mb-4">
              <h3 className="section-title">Fuentes de tráfico</h3>
              <p className="section-subtitle">Origen de las sesiones</p>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_,i) => <div key={i} className="h-9 skeleton rounded" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {(data?.sources ?? []).slice(0,6).map((s: any, i: number) => {
                  const total = (data?.sources ?? []).reduce((a: number, x: any) => a + parseInt(x.sessions,10), 0) || 1
                  const sessions = parseInt(s.sessions, 10)
                  const pct      = (sessions / total * 100)
                  const cfg = SRC_COLORS[s.source] ?? { bg: '#6c1cfc10', color: '#6c1cfc', label: s.source }
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold"
                            style={{ background: cfg.bg, color: cfg.color }}>
                            {cfg.label}
                          </span>
                          <span className="text-xs text-slate-400 capitalize">{s.medium}</span>
                        </div>
                        <span className="text-sm font-bold text-slate-800 dark:text-white tabular-nums">
                          {sessions.toLocaleString('es-AR')}
                        </span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: cfg.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top páginas */}
          <div className="card">
            <div className="mb-4">
              <h3 className="section-title">Top páginas</h3>
              <p className="section-subtitle">Visitas únicas del período</p>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[...Array(7)].map((_,i) => <div key={i} className="h-10 skeleton rounded" />)}
              </div>
            ) : (
              <div className="-mx-2 space-y-0.5">
                {(data?.topPages ?? []).slice(0,8).map((p: any, i: number) => {
                  const max = parseInt(data.topPages[0]?.unique_visits ?? '1', 10)
                  const v   = parseInt(p.unique_visits, 10)
                  const pct = (v / max * 100)
                  return (
                    <div key={i} className="flex items-center gap-3 px-2 py-2 rounded-xl
                      hover:bg-nex-ghost dark:hover:bg-dark-muted transition-colors">
                      <span className="text-xs font-bold text-slate-300 dark:text-slate-600 w-4 tabular-nums shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                          {p.path === '/' ? '/ — Inicio' : p.path}
                        </p>
                        <div className="progress-track mt-1" style={{ height: '3px' }}>
                          <div className="progress-fill" style={{ width: `${pct}%`, background: '#6c1cfc' }} />
                        </div>
                      </div>
                      <span className="text-xs font-bold tabular-nums shrink-0"
                        style={{ color: '#6c1cfc' }}>
                        {v.toLocaleString('es-AR')}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Panel de salud + Recomendaciones IA */}
          <div className="space-y-4">

            {/* Estado GSC */}
            <div className="card">
              <div className="mb-3">
                <h3 className="section-title">Estado del sitio</h3>
                <p className="section-subtitle">Issues activos detectados</p>
              </div>
              <div className="divide-y divide-surface-border dark:divide-dark-border">
                <HealthRow label="Rich Results" count={h.richErrors ?? 0}
                  type={h.richErrors > 0 ? 'error' : 'ok'}
                  href={`/dashboard/${siteId}/rich-results`} />
                <HealthRow label="Seguridad" count={h.securityActive ?? 0}
                  type={h.securityActive > 0 ? 'error' : 'ok'}
                  href={`/dashboard/${siteId}/security`} />
                <HealthRow label="Alertas activas" count={h.alertsActive ?? 0}
                  type={h.alertsActive > 2 ? 'error' : h.alertsActive > 0 ? 'warn' : 'ok'}
                  href={`/dashboard/${siteId}/alerts`} />
                <HealthRow label="Emails GSC sin leer" count={h.unreadEmails ?? 0}
                  type={h.unreadEmails > 0 ? 'warn' : 'ok'}
                  href={`/dashboard/${siteId}/alerts`} />
              </div>
            </div>

            {/* Recomendaciones IA */}
            {!loading && (data?.aiRecs ?? []).length > 0 && (
              <div className="card relative overflow-hidden">
                {/* Decorative gradient */}
                <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none opacity-50"
                  style={{ background: 'radial-gradient(circle, rgba(108,28,252,0.15) 0%, transparent 70%)' }} />

                <div className="flex items-center gap-2 mb-3 relative z-10">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#6c1cfc,#9b5ffd)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3M6.343 6.343l-.707-.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">Recomendaciones IA</h3>
                    <p className="text-[10px] text-slate-400">Generadas por Claude</p>
                  </div>
                </div>

                <div className="space-y-3 relative z-10">
                  {(data.aiRecs as any[]).map((r: any) => (
                    <div key={r.id} className="flex gap-2.5 p-2.5 rounded-xl
                      bg-nex-ghost dark:bg-dark-muted border border-surface-border dark:border-dark-border">
                      <span className="shrink-0 mt-0.5">
                        <span className={r.priority === 'critical' ? 'badge-critical' : 'badge-high'}>
                          {r.priority === 'critical' ? '🔴' : '🟠'}
                        </span>
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-snug mb-0.5">
                          {r.title}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed line-clamp-2">
                          {r.action}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
