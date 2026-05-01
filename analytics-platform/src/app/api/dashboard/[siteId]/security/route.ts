import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId, 10)
  if (isNaN(siteId)) return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 })

  const rows = await query(`
    SELECT id, issue_type, severity, status,
           affected_urls, detected_at, resolved_at,
           description, recommendation
    FROM gsc_security_issues
    WHERE site_id = $1
    ORDER BY
      CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
      detected_at DESC
  `, [siteId])

  return NextResponse.json({ rows })
}
