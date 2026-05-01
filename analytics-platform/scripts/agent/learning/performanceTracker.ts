// ============================================================
// PERFORMANCE TRACKER
// Evaluates each applied change after a waiting period
// (default: 14 days) by comparing the trigger metric
// before vs. after the change was applied.
//
// Run daily by the cron job. Looks for changes that are:
//   - status = 'applied'
//   - applied_at >= 14 days ago (configurable)
//   - evaluated_at IS NULL
// ============================================================

import { query, queryOne } from '@/lib/db'
import { getPageCurrentMetric } from '../analysis/analyticsEngine'
import type { PerformanceComparison } from '../types'

const log = (msg: string) => console.log(`[PerfTracker] ${new Date().toISOString()} ${msg}`)

const EVAL_WAIT_DAYS = 14      // days to wait before evaluating

// ── Fetch changes ready for evaluation ─────────────────────

async function getChangesReadyForEval(): Promise<Array<{
  id: bigint
  siteId: number
  ghlPageId: string
  path: string
  actionType: string
  triggerMetric: string
  triggerValue: number
  appliedAt: Date
}>> {
  const rows = await query<{
    id: string
    site_id: string
    ghl_page_id: string
    path: string | null
    action_type: string
    trigger_metric: string
    trigger_value: string
    applied_at: string
  }>(`
    SELECT
      gc.id,
      gc.site_id,
      gc.ghl_page_id,
      gp.path,
      gc.action_type,
      gc.trigger_metric,
      gc.trigger_value,
      gc.applied_at
    FROM ghl_changes gc
    LEFT JOIN ghl_pages gp
      ON gp.site_id = gc.site_id AND gp.ghl_page_id = gc.ghl_page_id
    WHERE gc.status = 'applied'
      AND gc.evaluated_at IS NULL
      AND gc.applied_at <= NOW() - INTERVAL '${EVAL_WAIT_DAYS} days'
      AND gc.trigger_metric IS NOT NULL
      AND gc.trigger_value IS NOT NULL
    ORDER BY gc.applied_at ASC
    LIMIT 50
  `)

  return rows
    .filter(r => r.path != null)
    .map(r => ({
      id:            BigInt(r.id),
      siteId:        parseInt(r.site_id, 10),
      ghlPageId:     r.ghl_page_id,
      path:          r.path!,
      actionType:    r.action_type,
      triggerMetric: r.trigger_metric,
      triggerValue:  parseFloat(r.trigger_value),
      appliedAt:     new Date(r.applied_at),
    }))
}

// ── Determine if a change was effective ───────────────────

function wasChangeEffective(
  metric: string,
  before: number,
  after: number,
): boolean {
  // Metrics where higher is better
  const higherIsBetter = [
    'gsc_ctr', 'avg_duration_sec', 'avg_scroll_depth_pct',
    'cta_click_rate', 'unique_visits', 'gsc_clicks',
  ]
  // Metrics where lower is better
  const lowerIsBetter = [
    'bounce_rate', 'exit_rate', 'funnel_drop_off_rate',
  ]

  if (higherIsBetter.includes(metric)) {
    // Effective if improved by at least 5% relative
    return after > before * 1.05
  }
  if (lowerIsBetter.includes(metric)) {
    // Effective if reduced by at least 5% relative
    return after < before * 0.95
  }

  // Default: any improvement
  return after > before
}

// ── Compute relative delta ─────────────────────────────────

function computeDelta(before: number, after: number, metric: string): number {
  if (before === 0) return after > 0 ? 100 : 0

  const lowerIsBetter = ['bounce_rate', 'exit_rate', 'funnel_drop_off_rate']
  const raw = ((after - before) / before) * 100

  // For "lower is better" metrics, invert the sign so positive = improvement
  return lowerIsBetter.includes(metric) ? -raw : raw
}

// ── Save evaluation result ─────────────────────────────────

async function saveEvaluation(
  changeId: bigint,
  metricBefore: number,
  metricAfter: number,
  metricDelta: number,
  wasEffective: boolean,
): Promise<void> {
  await query(`
    UPDATE ghl_changes
    SET
      evaluated_at  = NOW(),
      metric_before = $2,
      metric_after  = $3,
      metric_delta  = $4,
      was_effective = $5
    WHERE id = $1
  `, [changeId.toString(), metricBefore, metricAfter, metricDelta, wasEffective])
}

// ── Main evaluation run ────────────────────────────────────

export async function evaluatePendingChanges(): Promise<PerformanceComparison[]> {
  const changes = await getChangesReadyForEval()
  log(`Found ${changes.length} changes ready for evaluation`)

  const comparisons: PerformanceComparison[] = []

  for (const change of changes) {
    try {
      // Get the metric BEFORE (stored as trigger_value at time of decision)
      const metricBefore = change.triggerValue

      // Get current metric (post-change, over the 14 days since applied)
      const metricAfter = await getPageCurrentMetric(
        change.siteId,
        change.path,
        change.triggerMetric,
        EVAL_WAIT_DAYS,
      )

      if (metricAfter === 0 && change.triggerMetric !== 'unique_visits') {
        // No data yet — skip
        log(`  No post-change data for ${change.path} (${change.triggerMetric}), skipping`)
        continue
      }

      const metricDelta  = computeDelta(metricBefore, metricAfter, change.triggerMetric)
      const wasEffective = wasChangeEffective(change.triggerMetric, metricBefore, metricAfter)

      await saveEvaluation(change.id, metricBefore, metricAfter, metricDelta, wasEffective)

      const comparison: PerformanceComparison = {
        changeId:        change.id,
        ghlPageId:       change.ghlPageId,
        actionType:      change.actionType as any,
        triggerMetric:   change.triggerMetric,
        metricBefore,
        metricAfter,
        metricDelta,
        wasEffective,
        daysAfterChange: EVAL_WAIT_DAYS,
      }
      comparisons.push(comparison)

      const symbol = wasEffective ? '✓' : '✗'
      log(
        `  ${symbol} Change ${change.id} on ${change.path}: `
        + `${change.triggerMetric} ${metricBefore.toFixed(3)} → ${metricAfter.toFixed(3)} `
        + `(${metricDelta > 0 ? '+' : ''}${metricDelta.toFixed(1)}%)`,
      )

    } catch (err) {
      log(`  Error evaluating change ${change.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  log(`Evaluated ${comparisons.length} changes: ${comparisons.filter(c => c.wasEffective).length} effective`)
  return comparisons
}
