'use client'

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

interface DeviceChartProps {
  desktop:  number
  mobile:   number
  tablet:   number
  loading?: boolean
}

export function DeviceChart({ desktop, mobile, tablet, loading }: DeviceChartProps) {
  const total = (desktop + mobile + tablet) || 1

  const data = [
    { name: 'Desktop', value: desktop, color: '#6c1cfc' },
    { name: 'Mobile',  value: mobile,  color: '#007bff'  },
    { name: 'Tablet',  value: tablet,  color: '#f95f47'  },
  ].filter(d => d.value > 0)

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="h-5 skeleton rounded w-28 mb-4" />
        <div className="w-32 h-32 skeleton rounded-full mx-auto my-4" />
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-4 skeleton rounded" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="card flex flex-col">
      <div className="mb-4">
        <h3 className="section-title">Dispositivos</h3>
        <p className="section-subtitle">Distribución de visitas</p>
      </div>

      <div className="flex-1">
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <defs>
              <filter id="shadow">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
              </filter>
            </defs>
            <Pie data={data} cx="50%" cy="50%"
              innerRadius={44} outerRadius={68}
              dataKey="value" strokeWidth={0} filter="url(#shadow)">
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip
              formatter={(value) => {
                const raw = Array.isArray(value) ? value[0] : value
                const numeric = typeof raw === 'number' ? raw : Number(raw ?? 0)
                return [`${((numeric / total) * 100).toFixed(1)}% (${numeric.toLocaleString('es-AR')})`, '']
              }}
              contentStyle={{
                background: '#fff', border: '1px solid #ede9ff',
                borderRadius: '0.75rem', fontSize: '12px',
                boxShadow: '0 4px 20px rgba(108,28,252,0.15)',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2 mt-2">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-sm text-slate-600 dark:text-slate-400 flex-1">{d.name}</span>
            <div className="flex items-center gap-2">
              <div className="w-16 progress-track">
                <div className="progress-fill" style={{ width: `${(d.value / total * 100)}%`, background: d.color }} />
              </div>
              <span className="text-sm font-bold tabular-nums text-slate-800 dark:text-white w-8 text-right">
                {((d.value / total) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
