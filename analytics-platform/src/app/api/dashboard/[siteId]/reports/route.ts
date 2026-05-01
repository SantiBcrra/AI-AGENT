// ============================================================
// GET /api/dashboard/[siteId]/reports
//
// Devuelve los reportes IA generados (semanales y mensuales).
// Parámetros:
//   ?type=weekly|monthly   — filtrar por tipo (default: todos)
//   ?limit=10              — máximo de resultados (default: 10, max: 50)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId, 10)
  if (isNaN(siteId)) {
    return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 })
  }

  const sp    = req.nextUrl.searchParams
  const type  = sp.get('type')   // 'weekly' | 'monthly' | null (todos)
  const limit = Math.min(50, parseInt(sp.get('limit') ?? '10', 10) || 10)

  // Validar type
  if (type && type !== 'weekly' && type !== 'monthly') {
    return NextResponse.json({ error: 'type must be weekly or monthly' }, { status: 400 })
  }

  // Listado de reportes
  const reports = await query<{
    id:            string
    report_type:   string
    period_start:  string
    period_end:    string
    headline:      string | null
    summary:       string | null
    full_report:   string | null
    total_visits:  string
    visits_change: string | null
    top_pages:     string
    top_keywords:  string
    issues_found:  string
    issues_resolved: string
    sent_by_email: boolean
    sent_at:       string | null
    generated_at:  string
  }>(`
    SELECT
      id, report_type, period_start, period_end,
      headline, summary, full_report,
      total_visits, visits_change,
      top_pages, top_keywords,
      issues_found, issues_resolved,
      sent_by_email, sent_at, generated_at
    FROM ai_reports
    WHERE site_id = $1
      ${type ? 'AND report_type = $3' : ''}
    ORDER BY period_start DESC
    LIMIT $2
  `, type ? [siteId, limit, type] : [siteId, limit])

  // Resumen de cuántos reportes hay por tipo
  const summary = await queryOne<{
    weekly_count:  string
    monthly_count: string
    latest_weekly: string | null
    latest_monthly: string | null
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE report_type = 'weekly')  AS weekly_count,
      COUNT(*) FILTER (WHERE report_type = 'monthly') AS monthly_count,
      MAX(period_start) FILTER (WHERE report_type = 'weekly')  AS latest_weekly,
      MAX(period_start) FILTER (WHERE report_type = 'monthly') AS latest_monthly
    FROM ai_reports
    WHERE site_id = $1
  `, [siteId])

  return NextResponse.json({
    reports: reports.map(r => ({
      id:           parseInt(r.id, 10),
      type:         r.report_type,
      periodStart:  r.period_start,
      periodEnd:    r.period_end,
      headline:     r.headline,
      summary:      r.summary,
      fullReport:   r.full_report,
      metrics: {
        totalVisits:    parseInt(r.total_visits, 10),
        visitsChange:   r.visits_change ? parseFloat(r.visits_change) : null,
        issuesFound:    parseInt(r.issues_found, 10),
        issuesResolved: parseInt(r.issues_resolved, 10),
      },
      topPages:    JSON.parse(r.top_pages    || '[]'),
      topKeywords: JSON.parse(r.top_keywords || '[]'),
      sentByEmail: r.sent_by_email,
      sentAt:      r.sent_at,
      generatedAt: r.generated_at,
    })),
    meta: {
      weeklyCount:   parseInt(summary?.weekly_count  ?? '0', 10),
      monthlyCount:  parseInt(summary?.monthly_count ?? '0', 10),
      latestWeekly:  summary?.latest_weekly  ?? null,
      latestMonthly: summary?.latest_monthly ?? null,
    },
  })
}
