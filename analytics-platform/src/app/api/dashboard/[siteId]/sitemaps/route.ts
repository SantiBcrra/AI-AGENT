import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId, 10)
  if (isNaN(siteId)) return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 })

  const rows = await query(`
    SELECT id, sitemap_url, status,
           urls_submitted, urls_indexed,
           warnings_count, errors_count,
           last_submitted, last_downloaded
    FROM gsc_sitemaps
    WHERE site_id = $1
    ORDER BY last_submitted DESC NULLS LAST
  `, [siteId])

  return NextResponse.json({ rows })
}
