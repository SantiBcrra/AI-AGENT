'use client'

import Image from 'next/image'

export type Range = '7d' | '28d' | '90d'

interface HeaderProps {
  title:     string
  subtitle?: string
  siteId:    string
  range:     Range
  onRange:   (r: Range) => void
}

const RANGES: { value: Range; label: string }[] = [
  { value: '7d',  label: '7 días'  },
  { value: '28d', label: '28 días' },
  { value: '90d', label: '90 días' },
]

export function Header({ title, subtitle, range, onRange }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between h-16 px-6
      bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md
      border-b border-surface-border dark:border-dark-border">

      {/* Título de la sección */}
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">{title}</h1>
        {subtitle && (
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{subtitle}</p>
        )}
      </div>

      {/* Controles derechos */}
      <div className="flex items-center gap-3 shrink-0 ml-4">

        {/* Selector de rango */}
        <div className="range-tabs hidden sm:flex">
          {RANGES.map(r => (
            <button key={r.value} onClick={() => onRange(r.value)}
              className={`range-tab ${range === r.value ? 'active' : ''}`}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Botón refresh */}
        <button onClick={() => window.location.reload()}
          className="btn-ghost p-2 rounded-xl"
          title="Actualizar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold
          shadow-nex-sm cursor-pointer hover:shadow-nex-md transition-shadow"
          style={{ background: 'linear-gradient(135deg, #6c1cfc, #9b5ffd)' }}>
          A
        </div>
      </div>
    </header>
  )
}
