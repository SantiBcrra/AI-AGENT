// ============================================================
// GET /api/dashboard/[siteId]/ingestion
// Resumen de eventos crudos del tracker (debug / verificación)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId, 10)
  if (isNaN(siteId)) {
    return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 })
  }

  const site = await queryOne<{
    id: number
    domain: string
    tracking_id: string
    is_active: boolean
  }>(`
    SELECT id, domain, tracking_id, is_active
    FROM sites WHERE id = $1
  `, [siteId])

  if (!site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  }

  const [
    summary,
    byType,
    recent,
  ] = await Promise.all([
    queryOne<{
      events_1h: string
      events_24h: string
      events_7d: string
      sessions_24h: string
      last_event_at: string | null
      first_event_at: string | null
    }>(`
      SELECT
        (SELECT COUNT(*)::TEXT FROM events e
          WHERE e.site_id = $1 AND e.created_at >= NOW() - INTERVAL '1 hour')   AS events_1h,
        (SELECT COUNT(*)::TEXT FROM events e
          WHERE e.site_id = $1 AND e.created_at >= NOW() - INTERVAL '24 hours') AS events_24h,
        (SELECT COUNT(*)::TEXT FROM events e
          WHERE e.site_id = $1 AND e.created_at >= NOW() - INTERVAL '7 days')  AS events_7d,
        (SELECT COUNT(*)::TEXT FROM sessions s
          WHERE s.site_id = $1 AND s.started_at >= NOW() - INTERVAL '24 hours') AS sessions_24h,
        (SELECT MAX(e.created_at)::TEXT FROM events e WHERE e.site_id = $1)     AS last_event_at,
        (SELECT MIN(e.created_at)::TEXT FROM events e WHERE e.site_id = $1)     AS first_event_at
    `, [siteId]),

    query<{ event_type: string; c: string }>(`
      SELECT event_type, COUNT(*)::TEXT AS c
      FROM events
      WHERE site_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY event_type
      ORDER BY COUNT(*) DESC
    `, [siteId]),

    query<{
      id: string
      event_type: string
      path: string
      page_title: string | null
      created_at: string
    }>(`
      SELECT id::TEXT, event_type, path, page_title, created_at::TEXT
      FROM events
      WHERE site_id = $1
      ORDER BY created_at DESC
      LIMIT 40
    `, [siteId]),
  ])

  return NextResponse.json({
    site: {
      id: site.id,
      domain: site.domain,
      tracking_id: site.tracking_id,
      is_active: site.is_active,
    },
    summary: {
      events_last_1h:  parseInt(summary?.events_1h  ?? '0', 10),
      events_last_24h: parseInt(summary?.events_24h ?? '0', 10),
      events_last_7d:  parseInt(summary?.events_7d  ?? '0', 10),
      sessions_last_24h: parseInt(summary?.sessions_24h ?? '0', 10),
      last_event_at: summary?.last_event_at ?? null,
      first_event_at: summary?.first_event_at ?? null,
    },
    by_type_24h: (byType ?? []).map(r => ({
      event_type: r.event_type,
      count: parseInt(r.c, 10),
    })),
    recent: recent ?? [],
  })
}
