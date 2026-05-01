import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId, 10)
  if (isNaN(siteId)) return NextResponse.json({ error: 'Invalid' }, { status: 400 })

  const [summary, issues] = await Promise.all([
    // Resumen por tipo
    query(`
      SELECT result_type,
        COUNT(*) FILTER (WHERE status = 'valid')                AS valid,
        COUNT(*) FILTER (WHERE status = 'valid_with_warnings')  AS warnings,
        COUNT(*) FILTER (WHERE status = 'error')                AS errors,
        COUNT(*) FILTER (WHERE status = 'not_detected')         AS not_detected,
        COUNT(*)                                                AS total,
        MAX(last_inspected)                                     AS last_inspected
      FROM gsc_rich_results
      WHERE site_id = $1
      GROUP BY result_type
      ORDER BY errors DESC, result_type
    `, [siteId]),

    // URLs con errores o warnings
    query(`
      SELECT page_url, result_type, status, errors_count, warnings_count, issues
      FROM gsc_rich_results
      WHERE site_id = $1 AND status IN ('error', 'valid_with_warnings')
      ORDER BY
        CASE status WHEN 'error' THEN 0 ELSE 1 END,
        errors_count DESC
      LIMIT 50
    `, [siteId]),
  ])

  return NextResponse.json({ summary, issues })
}
