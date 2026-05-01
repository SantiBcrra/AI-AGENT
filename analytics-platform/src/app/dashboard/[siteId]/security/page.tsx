'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Header, type Range } from '@/components/layout/header'

const ISSUE_TYPES: Record<string, { label: string; icon: string; desc: string }> = {
  malware:         { label: 'Malware',           icon: '🦠', desc: 'Software malicioso detectado' },
  phishing:        { label: 'Phishing',          icon: '🎣', desc: 'Intento de suplantación' },
  unwanted_sw:     { label: 'Software no deseado', icon: '⚠️', desc: 'Software potencialmente dañino' },
  hacked_spam:     { label: 'Contenido hackeado', icon: '💀', desc: 'Spam inyectado por hackers' },
  manual_action:   { label: 'Acción manual',     icon: '⛔', desc: 'Penalización manual de Google' },
  social_eng:      { label: 'Ingeniería social',  icon: '🎭', desc: 'Engaño al usuario' },
}

const STATUS_MAP: Record<string, { badge: string; label: string }> = {
  active:   { badge: 'badge-critical', label: 'Activo' },
  resolved: { badge: 'badge-ok',       label: 'Resuelto' },
  pending:  { badge: 'badge-medium',   label: 'Pendiente' },
}

interface SecurityIssue {
  id:             number
  issue_type:     string
  severity:       string
  status:         string
  affected_urls:  string
  detected_at:    string
  resolved_at:    string | null
  description:    string
  recommendation: string
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return `hace ${Math.floor(diff / 86400)}d`
}

export default function SecurityPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [range,   setRange]   = useState<Range>('28d')
  const [issues,  setIssues]  = useState<SecurityIssue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/${siteId}/security`)
      .then(r => r.json())
      .then(d => { setIssues(d.rows ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [siteId])

  const activeIssues   = issues.filter(i => i.status === 'active').length
  const resolvedIssues = issues.filter(i => i.status === 'resolved').length
  const totalAffected  = issues.reduce((a, i) => a + parseInt(i.affected_urls, 10), 0)
  const isClean        = activeIssues === 0

  return (
    <>
      <Header title="Seguridad" subtitle="Issues de seguridad detectados por Google"
        siteId={siteId} range={range} onRange={setRange} />

      <div className="p-6 space-y-6 animate-fade-in">

        {/* ── Security status banner ───────────────────── */}
        {!loading && (
          <div className={`rounded-2xl p-5 flex items-center gap-4 border transition-all
            ${isClean
              ? 'border-emerald-200/60 dark:border-emerald-800/40'
              : 'border-red-200/60 dark:border-red-800/40'
            }`}
            style={{ background: isClean ? 'rgba(5,150,105,0.06)' : 'rgba(239,68,68,0.06)' }}>
            <div className="text-4xl shrink-0">{isClean ? '🛡️' : '🚨'}</div>
            <div className="flex-1">
              <p className={`text-lg font-bold ${isClean
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400'}`}>
                {isClean ? 'Sitio limpio' : `${activeIssues} issue${activeIssues > 1 ? 's' : ''} activo${activeIssues > 1 ? 's' : ''}`}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {isClean
                  ? 'No se detectaron problemas de seguridad. El sitio está protegido.'
                  : 'Se detectaron problemas de seguridad que requieren atención inmediata.'}
              </p>
            </div>
            <span className={isClean ? 'badge-ok' : 'badge-critical'}>
              {isClean ? 'Seguro' : 'Requiere acción'}
            </span>
          </div>
        )}

        {/* ── KPIs ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Issues activos',   value: activeIssues,   color: activeIssues > 0 ? '#ef4444' : '#059669', icon: '🚨' },
            { label: 'Resueltos',        value: resolvedIssues,  color: '#059669', icon: '✅' },
            { label: 'URLs afectadas',   value: totalAffected,   color: '#d97706', icon: '🔗' },
            { label: 'Total issues',     value: issues.length,   color: '#6c1cfc', icon: '📋' },
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

        {/* ── Issues list ──────────────────────────────── */}
        <div>
          <div className="mb-4">
            <h3 className="section-title">Historial de issues</h3>
            <p className="section-subtitle">Issues de seguridad detectados por Google Search Console</p>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="card h-28 skeleton animate-pulse" />)}
            </div>
          ) : issues.length === 0 ? (
            <div className="card py-16 text-center">
              <div className="text-5xl mb-4">🛡️</div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 text-lg">Sin issues de seguridad</p>
              <p className="text-sm text-slate-400 mt-2">
                Google no ha detectado problemas de seguridad en este sitio
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {issues.map((issue, i) => {
                const type   = ISSUE_TYPES[issue.issue_type] ?? { label: issue.issue_type, icon: '⚠️', desc: '' }
                const status = STATUS_MAP[issue.status]      ?? STATUS_MAP.pending
                const isActive = issue.status === 'active'

                return (
                  <div key={i} className={`card hover:shadow-nex-md transition-all duration-200
                    ${isActive ? 'border-l-4 border-l-red-500' : ''}`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0
                        ${isActive ? 'bg-red-50 dark:bg-red-900/20' : 'bg-slate-50 dark:bg-dark-muted'}`}>
                        {type.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className={status.badge}>{status.label}</span>
                          <span className="text-sm font-semibold text-slate-800 dark:text-white">
                            {type.label}
                          </span>
                          <span className="text-xs text-slate-400 ml-auto">
                            Detectado {timeAgo(issue.detected_at)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
                          {issue.description || type.desc}
                        </p>
                        {parseInt(issue.affected_urls, 10) > 0 && (
                          <p className="text-xs text-slate-400">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              {parseInt(issue.affected_urls, 10).toLocaleString('es-AR')}
                            </span> URLs afectadas
                          </p>
                        )}
                        {issue.recommendation && (
                          <div className="mt-3 rounded-xl px-3 py-2.5 border"
                            style={{ background: 'rgba(108,28,252,0.04)', borderColor: 'rgba(108,28,252,0.15)' }}>
                            <p className="text-xs font-semibold mb-1" style={{ color: '#6c1cfc' }}>Recomendación</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">{issue.recommendation}</p>
                          </div>
                        )}
                        {issue.resolved_at && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
                            ✓ Resuelto {timeAgo(issue.resolved_at)}
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

      </div>
    </>
  )
}
