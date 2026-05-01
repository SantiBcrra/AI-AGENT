'use client'

import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

export interface TrafficPoint {
  date:        string
  visitas:     number
  clicks_gsc:  number
  impresiones: number
}

interface TrafficChartProps {
  data:    TrafficPoint[]
  loading?: boolean
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-dark-card border border-surface-border dark:border-dark-border
      rounded-xl p-3 shadow-nex-md text-xs min-w-[150px]">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2 text-sm">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-slate-500 dark:text-slate-400">{p.name}</span>
          </div>
          <span className="font-bold text-slate-800 dark:text-white tabular-nums">
            {Number(p.value).toLocaleString('es-AR')}
          </span>
        </div>
      ))}
    </div>
  )
}

export function TrafficChart({ data, loading }: TrafficChartProps) {
  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div className="h-5 skeleton rounded w-44" />
        </div>
        <div className="h-64 skeleton rounded-xl" />
      </div>
    )
  }

  return (
    <div className="card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          <h3 className="section-title">Tráfico en el tiempo</h3>
          <p className="section-subtitle">Visitas propias vs Google Search Console</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          {[
            { color: '#6c1cfc', label: 'Visitas propias' },
            { color: '#007bff', label: 'Clicks GSC' },
            { color: '#b28afd', label: 'Impresiones' },
          ].map(l => (
            <span key={l.label} className="hidden md:flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 rounded inline-block" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="gradPurple" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6c1cfc" stopOpacity={0.18}/>
                <stop offset="95%" stopColor="#6c1cfc" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#007bff" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#007bff" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ede9ff" strokeOpacity={0.7} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false} axisLine={false}
              tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#6c1cfc', strokeWidth: 1, strokeDasharray: '4 2' }} />
            <Area type="monotone" dataKey="visitas" name="Visitas propias"
              stroke="#6c1cfc" strokeWidth={2.5} fill="url(#gradPurple)"
              dot={false} activeDot={{ r: 5, fill: '#6c1cfc', strokeWidth: 0 }} />
            <Area type="monotone" dataKey="clicks_gsc" name="Clicks GSC"
              stroke="#007bff" strokeWidth={2} fill="url(#gradBlue)"
              dot={false} activeDot={{ r: 4, fill: '#007bff', strokeWidth: 0 }} />
            <Area type="monotone" dataKey="impresiones" name="Impresiones"
              stroke="#b28afd" strokeWidth={1.5} strokeDasharray="5 3" fill="none"
              dot={false} activeDot={{ r: 3, fill: '#b28afd', strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
