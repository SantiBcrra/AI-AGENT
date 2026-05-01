import { notFound } from 'next/navigation'
import { query, queryOne } from '@/lib/db'
import { Sidebar } from '@/components/layout/sidebar'

async function getSiteData(siteId: number) {
  const [site, health, allSites] = await Promise.all([
    queryOne<{ id: number; name: string; domain: string }>(`
      SELECT id, name, domain FROM sites WHERE id = $1 AND is_active = true
    `, [siteId]),
    queryOne<{
      total_alerts: string; unread_gsc_emails: string; security_issues: string
    }>(`
      SELECT total_alerts, unread_gsc_emails, security_issues
      FROM v_site_health WHERE site_id = $1
    `, [siteId]),
    query<{ id: number; name: string; domain: string; health_score: number }>(`
      SELECT site_id AS id, domain AS name, domain, health_score
      FROM v_site_health ORDER BY domain
    `),
  ])
  return { site, health, allSites }
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { siteId: string }
}) {
  const siteId = parseInt(params.siteId, 10)
  if (isNaN(siteId)) notFound()

  const { site, health, allSites } = await getSiteData(siteId)
  if (!site) notFound()

  return (
    <div className="flex min-h-screen">
      <Sidebar
        siteId={String(siteId)}
        siteName={site.name}
        siteDomain={site.domain}
        sites={allSites}
        alertCount={parseInt(health?.total_alerts ?? '0', 10)}
        emailCount={parseInt(health?.unread_gsc_emails ?? '0', 10)}
        securityCount={parseInt(health?.security_issues ?? '0', 10)}
      />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        {children}
      </main>
    </div>
  )
}
