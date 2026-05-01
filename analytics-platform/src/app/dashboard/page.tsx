import Link from 'next/link'
import Image from 'next/image'
import { query } from '@/lib/db'

async function getSites() {
  return query<{
    site_id:           number
    domain:            string
    visits_7d:         string
    critical_alerts:   string
    health_score:      string
    rich_result_errors:string
    security_issues:   string
    unread_gsc_emails: string
    total_alerts:      string
  }>(`
    SELECT site_id, domain, visits_7d, critical_alerts, health_score,
           rich_result_errors, security_issues, unread_gsc_emails, total_alerts
    FROM v_site_health
    ORDER BY domain
  `)
}

function HealthRing({ score }: { score: number }) {
  const r = 20
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 80 ? '#059669' : score >= 50 ? '#d97706' : '#ef4444'

  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0">
      <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor"
        strokeWidth="5" className="text-slate-100 dark:text-dark-muted" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color}
        strokeWidth="5" strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round" transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="700"
        fill={color}>{score}</text>
    </svg>
  )
}

export default async function DashboardHome() {
  const sites = await getSites()

  const totalAlerts  = sites.reduce((a, s) => a + parseInt(s.critical_alerts,    10), 0)
  const totalVisits  = sites.reduce((a, s) => a + parseInt(s.visits_7d,          10), 0)
  const totalRich    = sites.reduce((a, s) => a + parseInt(s.rich_result_errors, 10), 0)
  const avgHealth    = sites.length
    ? Math.round(sites.reduce((a, s) => a + parseInt(s.health_score, 10), 0) / sites.length)
    : 0

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-surface)' }}>

      {/* ── Top nav ──────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-surface-border dark:border-dark-border
        bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Nexphaz" width={110} height={28} className="object-contain" />
            <span className="hidden sm:block text-xs px-2 py-0.5 rounded-md font-semibold"
              style={{ background: 'rgba(108,28,252,0.10)', color: '#6c1cfc' }}>Analytics</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden md:block">
              {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ background: 'linear-gradient(135deg,#6c1cfc,#9b5ffd)' }}>N</div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8 animate-fade-in">

        {/* ── Hero heading ─────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Panel de sitios</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {sites.length} sitio{sites.length !== 1 ? 's' : ''} monitoreado{sites.length !== 1 ? 's' : ''} · Actualizado automáticamente
            </p>
          </div>
          <Link href="/dashboard/new">
            <button className="btn-primary flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Agregar sitio
            </button>
          </Link>
        </div>

        {/* ── Global KPIs ──────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Visitas 7d',       value: totalVisits.toLocaleString('es-AR'), icon: '👥', color: '#6c1cfc' },
            { label: 'Health promedio',  value: `${avgHealth}`,                       icon: '💚', color: '#059669' },
            { label: 'Alertas críticas', value: `${totalAlerts}`,                     icon: '🚨', color: '#ef4444' },
            { label: 'Errores rich',     value: `${totalRich}`,                       icon: '⚠️', color: '#d97706' },
          ].map(m => (
            <div key={m.label} className="card relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-full"
                style={{ background: `radial-gradient(circle, ${m.color}20 0%, transparent 70%)` }} />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                  style={{ background: `${m.color}15` }}>
                  {m.icon}
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: m.color }}>{m.value}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{m.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Sites grid ───────────────────────────────── */}
        <div>
          <h2 className="section-title mb-4">Sitios</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sites.map(s => {
              const score   = parseInt(s.health_score,       10)
              const alerts  = parseInt(s.critical_alerts,    10)
              const emails  = parseInt(s.unread_gsc_emails,  10)
              const richErr = parseInt(s.rich_result_errors, 10)
              const secIss  = parseInt(s.security_issues,    10)
              const visits  = parseInt(s.visits_7d,          10)
              const hasIssues = alerts > 0 || secIss > 0 || richErr > 0 || emails > 0

              return (
                <Link key={s.site_id} href={`/dashboard/${s.site_id}`}>
                  <div className="card cursor-pointer group hover:shadow-nex-md transition-all duration-200
                    hover:-translate-y-0.5 relative overflow-hidden">

                    {/* Decorative top gradient */}
                    <div className="absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'linear-gradient(90deg,#6c1cfc,#007bff,#f95f47)' }} />

                    {/* Domain row */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Favicon placeholder */}
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-bold"
                          style={{ background: 'linear-gradient(135deg,#6c1cfc,#9b5ffd)' }}>
                          {s.domain.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-white truncate text-sm
                            group-hover:text-nex-purple dark:group-hover:text-nex-lavender transition-colors">
                            {s.domain}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {visits.toLocaleString('es-AR')} visitas 7d
                          </p>
                        </div>
                      </div>
                      <HealthRing score={score} />
                    </div>

                    {/* Progress bar */}
                    <div className="h-1 rounded-full overflow-hidden bg-slate-100 dark:bg-dark-muted mb-4">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${score}%`,
                          background: score >= 80
                            ? 'linear-gradient(90deg,#059669,#10b981)'
                            : score >= 50
                              ? 'linear-gradient(90deg,#d97706,#f59e0b)'
                              : 'linear-gradient(90deg,#ef4444,#f87171)',
                        }} />
                    </div>

                    {/* Quick stats */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {[
                        { label: 'Alertas',    value: parseInt(s.total_alerts,       10), warn: parseInt(s.total_alerts,       10) > 0 },
                        { label: 'Rich err.',  value: richErr,                            warn: richErr > 0 },
                        { label: 'Emails',     value: emails,                             warn: emails > 0 },
                      ].map(stat => (
                        <div key={stat.label} className="text-center py-2 rounded-xl bg-slate-50 dark:bg-dark-muted">
                          <p className={`text-sm font-bold tabular-nums ${stat.warn ? 'text-nex-coral' : 'text-slate-700 dark:text-slate-300'}`}>
                            {stat.value}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{stat.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Issue badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {alerts > 0 && (
                        <span className="badge-critical">{alerts} crítica{alerts !== 1 ? 's' : ''}</span>
                      )}
                      {secIss > 0 && (
                        <span className="badge-critical">{secIss} seguridad</span>
                      )}
                      {richErr > 0 && (
                        <span className="badge-medium">{richErr} rich result{richErr !== 1 ? 's' : ''}</span>
                      )}
                      {emails > 0 && (
                        <span className="badge-info">{emails} email{emails !== 1 ? 's' : ''} GSC</span>
                      )}
                      {!hasIssues && (
                        <span className="badge-ok">Todo OK</span>
                      )}
                    </div>

                    {/* Arrow indicator */}
                    <div className="absolute bottom-4 right-4 w-6 h-6 rounded-full flex items-center justify-center
                      opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0"
                      style={{ background: 'linear-gradient(135deg,#6c1cfc,#9b5ffd)' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                        stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </div>
                  </div>
                </Link>
              )
            })}

            {/* Add site card */}
            <Link href="/dashboard/new">
              <div className="card border-2 border-dashed border-slate-200 dark:border-dark-border
                hover:border-nex-purple/40 dark:hover:border-nex-purple/40 transition-all duration-200 cursor-pointer
                flex flex-col items-center justify-center text-center gap-3 min-h-[220px] group
                hover:bg-nex-ghost dark:hover:bg-dark-muted/50">
                <div className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200
                  bg-slate-100 dark:bg-dark-muted group-hover:scale-110"
                  style={{ boxShadow: 'none' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" className="text-slate-400 group-hover:text-nex-purple transition-colors"
                    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-600 dark:text-slate-400 group-hover:text-nex-purple dark:group-hover:text-nex-lavender transition-colors">
                    Agregar sitio
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Conectar dominio y GSC</p>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────── */}
        <footer className="pt-4 border-t border-surface-border dark:border-dark-border
          flex items-center justify-between flex-wrap gap-3">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Nexphaz Analytics · Datos actualizados diariamente vía Google Search Console
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Sistema operativo
          </div>
        </footer>
      </div>
    </div>
  )
}
