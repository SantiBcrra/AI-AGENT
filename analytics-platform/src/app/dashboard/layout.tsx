import { query } from '@/lib/db'
import { redirect } from 'next/navigation'

// Obtiene la lista de sitios para el selector del sidebar
async function getSites() {
  return query<{
    id: number; name: string; domain: string; health_score: number
  }>(`SELECT site_id AS id, domain AS name, domain, health_score FROM v_site_health ORDER BY domain`)
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-bg">
      {children}
    </div>
  )
}
