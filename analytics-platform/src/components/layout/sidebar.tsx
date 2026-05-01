'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

/* ── SVG icon helper ──────────────────────────────────── */
function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const ICONS = {
  overview:    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  keywords:    'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  richResults: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
  sitemaps:    'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
  security:    'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  alerts:      'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  merchant:    'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  ingestion:   'M13 10V3L4 14h7v7l9-11h-7z',
  sites:       'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  chevronDown: 'M19 9l-7 7-7-7',
}

interface NavItem {
  label:      string
  href:       string
  icon:       keyof typeof ICONS
  badge?:     number
  badgeTone?: 'red' | 'purple' | 'blue'
}

function NavLink({ item, siteId }: { item: NavItem; siteId: string }) {
  const pathname = usePathname()
  const href     = item.href.replace('[siteId]', siteId)

  // Exact match para overview, startsWith para el resto
  const isOverview = item.href === '/dashboard/[siteId]'
  const active = isOverview ? pathname === href : pathname.startsWith(href)

  const badgeColors = {
    red:    'bg-nex-coral text-white',
    purple: 'bg-nex-purple text-white',
    blue:   'bg-nex-blue text-white',
  }

  return (
    <Link href={href} className={`nav-link ${active ? 'active' : ''}`}>
      <Icon d={ICONS[item.icon]} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center
          ${active ? 'bg-white/25 text-white' : badgeColors[item.badgeTone ?? 'purple']}`}>
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  )
}

interface SidebarProps {
  siteId:        string
  siteName:      string
  siteDomain:    string
  sites:         Array<{ id: number; name: string; domain: string; health_score: number }>
  alertCount:    number
  emailCount:    number
  securityCount: number
}

export function Sidebar({ siteId, siteName, siteDomain, sites, alertCount, emailCount, securityCount }: SidebarProps) {
  const totalNotifs = alertCount + emailCount

  const navItems: NavItem[] = [
    { label: 'Overview',          href: '/dashboard/[siteId]',              icon: 'overview' },
    { label: 'Tracker / ingesta', href: '/dashboard/[siteId]/ingestion',   icon: 'ingestion' },
    { label: 'Keywords',          href: '/dashboard/[siteId]/keywords',     icon: 'keywords' },
    { label: 'Rich Results',      href: '/dashboard/[siteId]/rich-results', icon: 'richResults' },
    { label: 'Sitemaps',          href: '/dashboard/[siteId]/sitemaps',     icon: 'sitemaps' },
    { label: 'Merchant & Fichas', href: '/dashboard/[siteId]/merchant',     icon: 'merchant' },
    { label: 'Seguridad',         href: '/dashboard/[siteId]/security',     icon: 'security',
      badge: securityCount, badgeTone: 'red' },
    { label: 'Alertas',           href: '/dashboard/[siteId]/alerts',       icon: 'alerts',
      badge: totalNotifs, badgeTone: 'purple' },
  ]

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 flex flex-col z-40
      bg-white dark:bg-dark-surface border-r border-surface-border dark:border-dark-border">

      {/* ── Logo / Brand ──────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-surface-border dark:border-dark-border shrink-0">
        <div className="relative w-8 h-8 shrink-0">
          <Image src="/logo.png" alt="Nexphaz" fill className="object-contain" />
        </div>
        <div className="min-w-0">
          <p className="font-black text-sm tracking-tight" style={{ color: '#6c1cfc' }}>Nexphaz</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-wider uppercase">Analytics</p>
        </div>
      </div>

      {/* ── Site selector ─────────────────────────────── */}
      <div className="px-3 py-3 border-b border-surface-border dark:border-dark-border shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 mb-2">
          Sitio activo
        </p>
        <details className="group">
          <summary className="flex items-center gap-2.5 px-2 py-2 rounded-xl cursor-pointer
            hover:bg-nex-ghost dark:hover:bg-dark-muted select-none list-none
            [&::-webkit-details-marker]:hidden transition-colors">
            {/* Health indicator */}
            <div className="w-1.5 h-8 rounded-full shrink-0 overflow-hidden">
              <div className="w-full h-full" style={{ background: 'linear-gradient(180deg,#6c1cfc,#b28afd)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-white truncate leading-tight">{siteName}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate leading-tight">{siteDomain}</p>
            </div>
            <Icon d={ICONS.chevronDown} size={14} />
          </summary>

          {/* Dropdown de sitios */}
          <div className="mt-1.5 space-y-0.5 pl-2">
            {sites.map(s => {
              const dotClass = s.health_score >= 80 ? 'health-dot-ok' : s.health_score >= 50 ? 'health-dot-warn' : 'health-dot-error'
              return (
                <Link key={s.id} href={`/dashboard/${s.id}`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors
                    ${String(s.id) === siteId
                      ? 'bg-nex-ghost dark:bg-dark-muted font-semibold text-nex-purple dark:text-nex-lavender'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-nex-ghost dark:hover:bg-dark-muted'
                    }`}>
                  <span className={dotClass} />
                  <span className="truncate flex-1">{s.domain}</span>
                  <span className="text-[10px] tabular-nums text-slate-400">{s.health_score}</span>
                </Link>
              )
            })}
            <Link href="/dashboard"
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs
                text-slate-400 hover:text-nex-purple dark:hover:text-nex-lavender transition-colors mt-1">
              <Icon d={ICONS.sites} size={12} />
              Ver todos los sitios
            </Link>
          </div>
        </details>
      </div>

      {/* ── Navigation ────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-3 py-2">
          Monitoreo
        </p>
        {navItems.map(item => (
          <NavLink key={item.href} item={item} siteId={siteId} />
        ))}
      </nav>

      {/* ── Footer ────────────────────────────────────── */}
      <div className="px-3 py-3 border-t border-surface-border dark:border-dark-border shrink-0">
        <Link href="/dashboard" className="nav-link text-xs">
          <Icon d={ICONS.sites} />
          Todos los sitios
        </Link>
        {/* Versión */}
        <p className="text-[10px] text-slate-300 dark:text-slate-600 text-center mt-2">
          Nexphaz Analytics v1.0
        </p>
      </div>
    </aside>
  )
}
