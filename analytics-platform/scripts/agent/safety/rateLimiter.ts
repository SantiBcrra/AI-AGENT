// ============================================================
// RATE LIMITER
// Enforces per-site and per-page change limits to prevent
// over-optimization and API abuse.
// ============================================================

import { queryOne } from '@/lib/db'
import type { RateLimitStatus, GHLSiteConfig } from '../types'

export async function checkRateLimit(
  siteConfig: GHLSiteConfig,
  ghlPageId: string,
): Promise<RateLimitStatus> {
  const { siteId, maxChangesPerDay, maxChangesPerPage, cooldownHours } = siteConfig

  const row = await queryOne<{
    changes_today: string
    changes_on_page_this_week: string
    last_change_on_page: string | null
  }>(`
    WITH
    site_day AS (
      SELECT COUNT(*) AS cnt
      FROM ghl_changes
      WHERE site_id = $1
        AND status IN ('applied', 'dry_run')
        AND created_at >= NOW() - INTERVAL '24 hours'
    ),
    page_week AS (
      SELECT COUNT(*) AS cnt
      FROM ghl_changes
      WHERE site_id = $1
        AND ghl_page_id = $2
        AND status IN ('applied', 'dry_run')
        AND created_at >= NOW() - INTERVAL '7 days'
    ),
    page_last AS (
      SELECT MAX(applied_at) AS last_at
      FROM ghl_changes
      WHERE site_id = $1
        AND ghl_page_id = $2
        AND status = 'applied'
    )
    SELECT
      (SELECT cnt FROM site_day)::TEXT                  AS changes_today,
      (SELECT cnt FROM page_week)::TEXT                 AS changes_on_page_this_week,
      (SELECT last_at::TEXT FROM page_last)             AS last_change_on_page
  `, [siteId, ghlPageId])

  const changesAppliedToday    = parseInt(row?.changes_today ?? '0', 10)
  const changesOnPageThisWeek  = parseInt(row?.changes_on_page_this_week ?? '0', 10)
  const lastChangeOnPage       = row?.last_change_on_page ? new Date(row.last_change_on_page) : undefined

  // Check daily site limit
  if (changesAppliedToday >= maxChangesPerDay) {
    return {
      allowed: false,
      reason: `Daily site limit reached (${changesAppliedToday}/${maxChangesPerDay} changes today)`,
      changesAppliedToday,
      maxChangesPerDay,
      changesOnPageThisWeek,
      maxChangesPerPage,
      lastChangeOnPage,
    }
  }

  // Check per-page weekly limit
  if (changesOnPageThisWeek >= maxChangesPerPage) {
    return {
      allowed: false,
      reason: `Page change limit reached (${changesOnPageThisWeek}/${maxChangesPerPage} changes this week on this page)`,
      changesAppliedToday,
      maxChangesPerDay,
      changesOnPageThisWeek,
      maxChangesPerPage,
      lastChangeOnPage,
    }
  }

  // Check cooldown period
  if (lastChangeOnPage) {
    const hoursSince = (Date.now() - lastChangeOnPage.getTime()) / 1000 / 3600
    if (hoursSince < cooldownHours) {
      const remaining = Math.ceil(cooldownHours - hoursSince)
      return {
        allowed: false,
        reason: `Cooldown active: last change was ${Math.floor(hoursSince)}h ago (need ${cooldownHours}h gap)`,
        changesAppliedToday,
        maxChangesPerDay,
        changesOnPageThisWeek,
        maxChangesPerPage,
        lastChangeOnPage,
        cooldownRemainingHours: remaining,
      }
    }
  }

  return {
    allowed: true,
    changesAppliedToday,
    maxChangesPerDay,
    changesOnPageThisWeek,
    maxChangesPerPage,
    lastChangeOnPage,
  }
}
