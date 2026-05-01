import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId, 10)
  if (isNaN(siteId)) return NextResponse.json({ error: 'Invalid' }, { status: 400 })

  const rows = await query(`
    SELECT id, subject, sender, alert_type, severity,
           summary, action_required, deadline,
           affected_urls, status, received_at, parsed_at
    FROM gsc_email_alerts
    WHERE site_id = $1
    ORDER BY
      CASE status WHEN 'unread' THEN 0 WHEN 'read' THEN 1 ELSE 2 END,
      CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      received_at DESC
    LIMIT 50
  `, [siteId])

  return NextResponse.json({ rows })
}
