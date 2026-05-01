'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Header, type Range } from '@/components/layout/header'

type AlertTab = 'system' | 'gsc_emails'

const SEVERITY_CONFIG: Record<string, { badge: string; label: string; color: string; dot: string }> = {
  critical: { badge: 'badge-critical', label: 'Crítico',  color: '#ef4444', dot: 'bg-red-500' },
  high:     { badge: 'badge-high',     label: 'Alto',     color: '#f97316', dot: 'bg-orange-500' },
  medium:   { badge: 'badge-medium',   label: 'Medio',    color: '#d97706', dot: 'bg-yellow-500' },
  low:      { badge: 'badge-low',      label: 'Bajo',     color: '#007bff', dot: 'bg-blue-400' },
  info:     { badge: 'badge-info',     label: 'Info',     color: '#6c1cfc', dot: 'bg-slate-400' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:       { label: 'Activa',      color: 'text-red-600 dark:text-red-400' },
  acknowledged: { label: 'Vista',       color: 'text-yellow-600 dark:text-yellow-500' },
  resolved:     { label: 'Resuelta',    color: 'text-emerald-600 dark:text-emerald-400' },
  unread:       { label: 'Sin leer',    color: 'text-nex-purple dark:text-nex-lavender' },
  read:         { label: 'Leída',       color: 'text-slate-500 dark:text-slate-400' },
  in_progress:  { label: 'En progreso', color: 'text-nex-purple dark:text-nex-lavender' },
  ignored:      { label: 'Ignorada',    color: 'text-slate-400' },
}

const EMAIL_ICONS: Record<string, string> = {
  security:      '🔐',
  manual_action: '⛔',
  coverage:      '📄',
  sitemap:       '🗺️',
  rich_result:   '✨',
  performance:   '📉',
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return `hace ${Math.floor(diff / 86400)}d`
}

export default function AlertsPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [range,   setRange]   = useState<Range>('28d')
  const [tab,     setTab]     = useState<AlertTab>('system')
  const [alerts,  setAlerts]  = useState<any[]>([])
  const [emails,  setEmails]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/dashboard/${siteId}/alerts/system`).then(r => r.json()),
      fetch(`/api/dashboard/${siteId}/alerts/emails`).then(r => r.json()),
    ]).then(([sys, mail]) => {
      setAlerts(sys.rows  ?? [])
      setEmails(mail.rows ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [siteId])

  const activeAlerts  = alerts.filter(a => a.status === 'active').length
  const unreadEmails  = emails.filter(e => e.status === 'unread').length
  const criticalCount = alerts.filter(a => a.severity === 'critical' && a.status === 'active').length

  return (
    <>
      <Header title="Alertas" subtitle="Notificaciones del sistema y emails de Google"
        siteId={siteId} range={range} onRange={setRange} />

      <div className="p-6 space-y-5 animate-fade-in">

        {/* ── Banner de alertas críticas ─────────────── */}
        {!loading && criticalCount > 0 && (
          <div className="rounded-2xl p-4 flex items-center gap-4 border border-red-200/60 dark:border-red-800/40"
            style={{ background: 'rgba(239,68,68,0.06)' }}>
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
              <span className="text-xl">🚨</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-red-700 dark:text-red-400">
                {criticalCount} alerta{criticalCount > 1 ? 's' : ''} crítica{criticalCount > 1 ? 's' : ''} activa{criticalCount > 1 ? 's' : ''}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Requieren atención inmediata
                {unreadEmails > 0 && ` · ${unreadEmails} email${unreadEmails > 1 ? 's' : ''} de GSC sin leer`}
              </p>
            </div>
            <span className="badge-critical shrink-0">Urgente</span>
          </div>
        )}

        {/* ── KPI rápidos ────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Alertas activas',    value: activeAlerts,  color: '#ef4444', icon: '🔔' },
            { label: 'Críticas',           value: criticalCount, color: '#f97316', icon: '🚨' },
            { label: 'Emails GSC',         value: emails.length, color: '#6c1cfc', icon: '📧' },
            { label: 'Sin leer',           value: unreadEmails,  color: '#007bff', icon: '📩' },
          ].map(m => (
            <div key={m.label} className="card relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-full"
                style={{ background: `radial-gradient(circle, ${m.color}20 0%, transparent 70%)` }} />
              {loading ? (
                <div className="h-12 skeleton rounded animate-pulse" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                    style={{ background: `${m.color}15` }}>
                    {m.icon}
                  </div>
                  <div>
                    <p className="text-xl font-bold tabular-nums" style={{ color: m.color }}>{m.value}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{m.label}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Tabs ──────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'system',     label: 'Sistema',    icon: '🔔',
              count: activeAlerts,  desc: 'Alertas del sistema' },
            { value: 'gsc_emails', label: 'Emails GSC', icon: '📧',
              count: unreadEmails,  desc: 'Correos de Google' },
          ].map(t => (
            <button key={t.value} onClick={() => setTab(t.value as AlertTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                transition-all duration-150 border
                ${tab === t.value
                  ? 'text-white shadow-nex-sm border-transparent'
                  : 'text-slate-500 dark:text-slate-400 border-surface-border dark:border-dark-border bg-white dark:bg-dark-card hover:border-nex-purple/30 hover:text-nex-purple dark:hover:text-nex-lavender'
                }`}
              style={tab === t.value ? { background: 'linear-gradient(135deg,#6c1cfc,#9b5ffd)' } : {}}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {t.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold
                  ${tab === t.value
                    ? 'bg-white/20 text-white'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Alertas del sistema ────────────────────── */}
        {tab === 'system' && (
          <div className="space-y-3">
            {loading ? (
              [...Array(4)].map((_, i) => <div key={i} className="card h-24 skeleton animate-pulse" />)
            ) : alerts.length === 0 ? (
              <div className="card py-16 text-center">
                <div className="text-4xl mb-3">✅</div>
                <p className="font-semibold text-slate-700 dark:text-slate-300">Sin alertas activas</p>
                <p className="text-sm text-slate-400 mt-1">Todo funciona correctamente</p>
              </div>
            ) : alerts.map((alert, i) => {
              const sev = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info
              const sta = STATUS_CONFIG[alert.status]    ?? STATUS_CONFIG.active
              const isActive = alert.status === 'active'

              return (
                <div key={i} className={`card hover:shadow-nex-md transition-all duration-200
                  ${isActive ? 'border-l-4' : ''}`}
                  style={isActive ? { borderLeftColor: sev.color } : {}}>
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${sev.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={sev.badge}>{sev.label}</span>
                        <span className={`text-xs font-medium ${sta.color}`}>{sta.label}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
                          {timeAgo(alert.triggered_at)}
                        </span>
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-white text-sm mb-1">
                        {alert.title}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        {alert.message}
                      </p>
                      {alert.change_pct && (
                        <div className="flex items-center gap-3 mt-2 p-2 rounded-lg bg-slate-50 dark:bg-dark-muted">
                          <span className="text-xs text-slate-400">Variación:</span>
                          <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                            {parseFloat(alert.change_pct) > 0 ? '+' : ''}{parseFloat(alert.change_pct).toFixed(1)}%
                          </span>
                          {alert.threshold_value && (
                            <>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs text-slate-400">Umbral: <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">{alert.threshold_value}%</span></span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Emails de GSC ─────────────────────────── */}
        {tab === 'gsc_emails' && (
          <div className="space-y-3">
            {loading ? (
              [...Array(4)].map((_, i) => <div key={i} className="card h-28 skeleton animate-pulse" />)
            ) : emails.length === 0 ? (
              <div className="card py-16 text-center">
                <div className="text-4xl mb-3">📭</div>
                <p className="font-semibold text-slate-700 dark:text-slate-300">Sin emails de GSC</p>
                <p className="text-sm text-slate-400 mt-1">Los avisos de Google Search Console aparecerán aquí</p>
              </div>
            ) : emails.map((email, i) => {
              const sev     = SEVERITY_CONFIG[email.severity] ?? SEVERITY_CONFIG.info
              const sta     = STATUS_CONFIG[email.status]     ?? STATUS_CONFIG.unread
              const isUnread = email.status === 'unread'

              return (
                <div key={i} className={`card hover:shadow-nex-md transition-all duration-200
                  ${isUnread ? 'border-l-4' : ''}`}
                  style={isUnread ? { borderLeftColor: '#6c1cfc' } : {}}>
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ background: isUnread ? 'rgba(108,28,252,0.10)' : 'rgba(148,163,184,0.10)' }}>
                      {EMAIL_ICONS[email.alert_type] ?? '📧'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        {isUnread && <span className="badge-info">Nuevo</span>}
                        <span className={sev.badge}>{sev.label}</span>
                        <span className={`text-xs font-medium ${sta.color}`}>{sta.label}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
                          {timeAgo(email.received_at)}
                        </span>
                      </div>
                      <p className={`text-sm mb-1.5 ${isUnread
                        ? 'font-semibold text-slate-900 dark:text-white'
                        : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                        {email.subject}
                      </p>
                      {email.summary && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
                          {email.summary}
                        </p>
                      )}
                      {email.action_required && (
                        <div className="rounded-xl px-3 py-2.5 mt-2 border"
                          style={{ background: 'rgba(249,95,71,0.06)', borderColor: 'rgba(249,95,71,0.20)' }}>
                          <p className="text-xs font-bold mb-0.5" style={{ color: '#f95f47' }}>Acción requerida</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">{email.action_required}</p>
                        </div>
                      )}
                      {email.deadline && (
                        <p className="text-xs text-red-500 mt-2 font-semibold">
                          ⏰ Fecha límite: {new Date(email.deadline).toLocaleDateString('es-AR')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </>
  )
}
