'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/* ── SVG icon helper (size-6 = 24px, igual que NextAdmin sidebar) ── */
function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round"
      className={cn('size-6 shrink-0', className)} aria-hidden="true">
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

  const isOverview = item.href === '/dashboard/[siteId]'
  const active = isOverview ? pathname === href : pathname.startsWith(href)

  const badgeColors = {
    red:    'bg-red-light text-white',
    purple: 'bg-primary text-white',
    blue:   'bg-blue-light text-white',
  }

  return (
    <Link
      href={href}
      className={cn(
        'relative flex w-full items-center gap-3 rounded-lg px-3.5 py-3 font-medium transition-all duration-200',
        active
          ? 'bg-[rgba(87,80,241,0.07)] text-primary hover:bg-[rgba(87,80,241,0.07)] dark:bg-[#FFFFFF1A] dark:text-white'
          : 'text-dark-4 hover:bg-gray-100 hover:text-dark hover:dark:bg-[#FFFFFF1A] hover:dark:text-white dark:text-dark-6',
      )}
    >
      <Icon d={ICONS[item.icon]} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span
          className={cn(
            'min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-xs font-bold',
            active
              ? 'bg-primary/15 text-primary dark:bg-white/20 dark:text-white'
              : badgeColors[item.badgeTone ?? 'purple'],
          )}
        >
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
    <aside
      className="sticky top-0 z-40 flex h-screen w-full max-w-[290px] shrink-0 flex-col overflow-hidden
        border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-dark"
      aria-label="Navegación del sitio"
    >
      <div className="flex h-full flex-col py-10 pl-[25px] pr-[7px]">
        {/* ── Logo / Brand (misma jerarquía que NextAdmin sidebar) ── */}
        <div className="relative pr-4.5">
          <Link href="/dashboard" className="flex items-center gap-2.5 px-0 py-2.5 min-[850px]:py-0">
            <div className="relative h-8 w-8 shrink-0">
              <Image src="/logo.png" alt="Nexphaz" fill className="object-contain" sizes="32px" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-tight text-dark dark:text-white">Nexphaz</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-dark-4 dark:text-dark-6">
                Analytics
              </p>
            </div>
          </Link>
        </div>

        {/* ── Site selector ─────────────────────────────── */}
        <div className="mt-6 min-[850px]:mt-10">
          <h2 className="mb-5 text-sm font-medium text-dark-4 dark:text-dark-6">Sitio activo</h2>
          <details className="group">
            <summary
              className="flex cursor-pointer list-none select-none items-center gap-2.5 rounded-lg px-2 py-2
                font-medium text-dark-4 transition-all duration-200 hover:bg-gray-100 hover:text-dark
                dark:text-dark-6 hover:dark:bg-[#FFFFFF1A] hover:dark:text-white
                [&::-webkit-details-marker]:hidden"
            >
              <div className="h-8 w-1.5 shrink-0 overflow-hidden rounded-full bg-primary/80" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight text-dark dark:text-white">{siteName}</p>
                <p className="truncate text-xs leading-tight text-dark-4 dark:text-dark-6">{siteDomain}</p>
              </div>
              <Icon d={ICONS.chevronDown} className="!size-3.5 shrink-0 opacity-70" />
            </summary>

            <div className="custom-scrollbar mt-2 max-h-48 space-y-0.5 overflow-y-auto pr-2">
              {sites.map(s => {
                const score = typeof s.health_score === 'string' ? parseInt(s.health_score, 10) : s.health_score
                const dotClass =
                  score >= 80 ? 'health-dot-ok' : score >= 50 ? 'health-dot-warn' : 'health-dot-error'
                return (
                  <Link
                    key={s.id}
                    href={`/dashboard/${s.id}`}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium transition-all duration-200',
                      String(s.id) === siteId
                        ? 'bg-[rgba(87,80,241,0.07)] text-primary dark:bg-[#FFFFFF1A] dark:text-white'
                        : 'text-dark-4 hover:bg-gray-100 hover:text-dark dark:text-dark-6 hover:dark:bg-[#FFFFFF1A] hover:dark:text-white',
                    )}
                  >
                    <span className={dotClass} />
                    <span className="flex-1 truncate">{s.domain}</span>
                    <span className="tabular-nums text-[10px] text-dark-4 dark:text-dark-6">{score}</span>
                  </Link>
                )
              })}
              <Link
                href="/dashboard"
                className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-dark-4
                  transition-all duration-200 hover:bg-gray-100 hover:text-dark dark:text-dark-6
                  hover:dark:bg-[#FFFFFF1A] hover:dark:text-white"
              >
                <Icon d={ICONS.sites} className="!size-4" />
                Ver todos los sitios
              </Link>
            </div>
          </details>
        </div>

        {/* ── Navigation ────────────────────────────────── */}
        <nav className="custom-scrollbar mt-6 flex-1 overflow-y-auto pr-3 min-[850px]:mt-8">
          <div className="mb-6">
            <h2 className="mb-5 text-sm font-medium text-dark-4 dark:text-dark-6">Monitoreo</h2>
            <ul className="space-y-2">
              {navItems.map(item => (
                <li key={item.href}>
                  <NavLink item={item} siteId={siteId} />
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* ── Footer ────────────────────────────────────── */}
        <div className="mt-auto border-t border-gray-200 pt-4 dark:border-gray-800">
          <Link
            href="/dashboard"
            className={cn(
              'relative flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-xs font-medium transition-all duration-200',
              'text-dark-4 hover:bg-gray-100 hover:text-dark dark:text-dark-6',
              'hover:dark:bg-[#FFFFFF1A] hover:dark:text-white',
            )}
          >
            <Icon d={ICONS.sites} />
            Todos los sitios
          </Link>
          <p className="mt-3 text-center text-[10px] text-dark-4 dark:text-dark-6">Nexphaz Analytics v1.0</p>
        </div>
      </div>
    </aside>
  )
}
