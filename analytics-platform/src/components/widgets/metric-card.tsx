'use client'

import React from 'react'

interface MetricCardProps {
  label:       string
  value:       string | number
  delta?:      number
  deltaLabel?: string
  icon?:       React.ReactNode
  accent?:     'purple' | 'blue' | 'coral' | 'navy' | 'violet' | 'green'
  suffix?:     string
  loading?:    boolean
  subValue?:   string
}

const ACCENT = {
  purple: { bg: 'rgba(108,28,252,0.10)', color: '#6c1cfc', glow: 'rgba(108,28,252,0.20)' },
  violet: { bg: 'rgba(155,95,253,0.10)', color: '#9b5ffd', glow: 'rgba(155,95,253,0.20)' },
  blue:   { bg: 'rgba(0,123,255,0.10)',  color: '#007bff', glow: 'rgba(0,123,255,0.20)'  },
  coral:  { bg: 'rgba(249,95,71,0.10)',  color: '#f95f47', glow: 'rgba(249,95,71,0.20)'  },
  navy:   { bg: 'rgba(50,77,161,0.10)',  color: '#324da1', glow: 'rgba(50,77,161,0.20)'  },
  green:  { bg: 'rgba(16,185,129,0.10)', color: '#10b981', glow: 'rgba(16,185,129,0.20)' },
}

export function MetricCard({ label, value, delta, deltaLabel, icon, accent = 'purple', suffix, loading, subValue }: MetricCardProps) {
  const a = ACCENT[accent]

  if (loading) {
    return (
      <div className="metric-card animate-pulse">
        <div className="flex items-start justify-between mb-4">
          <div className="h-3 skeleton rounded w-24" />
          <div className="w-9 h-9 skeleton rounded-xl" />
        </div>
        <div className="h-8 skeleton rounded w-28 mb-2" />
        <div className="h-3 skeleton rounded w-20" />
      </div>
    )
  }

  const isUp   = delta !== undefined && delta > 0
  const isDown = delta !== undefined && delta < 0

  return (
    <div className="metric-card group">
      {/* Decorative glow in top-right */}
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${a.glow} 0%, transparent 70%)` }} />

      <div className="flex items-start justify-between mb-4 relative z-10">
        <p className="metric-label">{label}</p>
        {icon && (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: a.bg, color: a.color }}>
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-end gap-1.5 mb-2 relative z-10">
        <span className="metric-value" style={{ letterSpacing: '-0.02em' }}>
          {typeof value === 'number' ? value.toLocaleString('es-AR') : value}
        </span>
        {suffix && <span className="text-sm text-slate-400 mb-1">{suffix}</span>}
      </div>

      <div className="flex items-center gap-2 relative z-10">
        {delta !== undefined && (
          <span className={isUp ? 'delta-up' : isDown ? 'delta-down' : 'delta-flat'}>
            {isUp ? '▲' : isDown ? '▼' : '—'}
            {' '}{Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {deltaLabel && <span className="text-xs text-slate-400">{deltaLabel}</span>}
        {subValue && !delta && <span className="text-xs text-slate-400">{subValue}</span>}
      </div>
    </div>
  )
}
