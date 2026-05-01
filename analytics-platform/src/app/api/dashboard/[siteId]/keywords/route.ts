import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId, 10)
  if (isNaN(siteId)) return NextResponse.json({ error: 'Invalid' }, { status: 400 })

  const tab    = req.nextUrl.searchParams.get('tab')    ?? 'opportunities'
  const search = req.nextUrl.searchParams.get('search') ?? ''
  const limit  = 50

  const searchFilter = search ? `AND query ILIKE $2` : ''
  const searchParam  = search ? [`%${search}%`] : []

  if (tab === 'opportunities') {
    const rows = await query(`
      SELECT query, avg_position, avg_ctr, total_impressions, total_clicks,
             opportunity_score, opportunity_type, clicks_delta, position_delta, trend
      FROM gsc_keywords
      WHERE site_id = $1 AND opportunity_score > 20
        ${searchFilter}
      ORDER BY opportunity_score DESC
      LIMIT ${limit}
    `, [siteId, ...searchParam])
    return NextResponse.json({ rows })
  }

  if (tab === 'top') {
    const rows = await query(`
      SELECT query, avg_position, avg_ctr, total_impressions, total_clicks,
             trend, clicks_delta, position_delta
      FROM gsc_keywords
      WHERE site_id = $1 ${searchFilter}
      ORDER BY total_clicks DESC
      LIMIT ${limit}
    `, [siteId, ...searchParam])
    return NextResponse.json({ rows })
  }

  if (tab === 'losing') {
    const rows = await query(`
      SELECT query, avg_position, avg_ctr, total_impressions, total_clicks,
             clicks_delta, position_delta, trend
      FROM gsc_keywords
      WHERE site_id = $1 AND trend = 'down' AND clicks_delta < 0
        ${searchFilter}
      ORDER BY clicks_delta ASC
      LIMIT ${limit}
    `, [siteId, ...searchParam])
    return NextResponse.json({ rows })
  }

  if (tab === 'new') {
    const rows = await query(`
      SELECT query, avg_position, avg_ctr, total_impressions, total_clicks, trend
      FROM gsc_keywords
      WHERE site_id = $1 AND trend = 'new'
        ${searchFilter}
      ORDER BY total_impressions DESC
      LIMIT ${limit}
    `, [siteId, ...searchParam])
    return NextResponse.json({ rows })
  }

  return NextResponse.json({ rows: [] })
}
