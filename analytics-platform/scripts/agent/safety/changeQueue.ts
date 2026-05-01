// ============================================================
// CHANGE QUEUE
// Routes high-impact or high-risk actions to ghl_change_queue
// for human review instead of auto-applying them.
//
// Criteria for queuing (set in actionEngine.ts):
//   - impactScore >= 8  (touches the most valuable pages)
//   - patch_html_section (DOM manipulation — hard to predict visually)
//
// Approved changes are applied by processApprovedQueueItem(),
// which can be called from an API endpoint or a separate cron.
//
// DB table: ghl_change_queue (created in 012_ghl_agent.sql)
// ============================================================

import { query, queryOne } from '@/lib/db'
import type { AgentAction, GHLSiteConfig } from '../types'
import { GHLClient } from '../action/ghl/ghlClient'
import { applyDirectApiUpdate } from '../action/strategies/directApiStrategy'
import { applyScriptInjection } from '../action/strategies/scriptInjectionStrategy'
import { applyHtmlPatch } from '../action/strategies/htmlPatchStrategy'
import { createBackup, linkBackupToChange } from './backupManager'
import { logChangePending, logChangeApplied, logChangeFailed } from './changeLogger'

const log = (msg: string) => console.log(`[ChangeQueue] ${new Date().toISOString()} ${msg}`)

// ── Insert a queued change ─────────────────────────────────

export async function queueHighImpactChange(
  action: AgentAction,
  siteId: number,
): Promise<bigint> {
  const priority =
    action.impactScore >= 9
      ? 'high'
      : action.impactScore >= 8
        ? 'medium'
        : 'low'

  const row = await queryOne<{ id: string }>(`
    INSERT INTO ghl_change_queue (
      site_id, ghl_page_id,
      action_type, priority,
      reason, expected_impact,
      payload,
      trigger_metric, trigger_value,
      status, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', NOW() + INTERVAL '7 days')
    RETURNING id
  `, [
    siteId,
    action.ghlPageId,
    action.actionType,
    priority,
    action.reason,
    action.expectedImpact,
    JSON.stringify(action.payload),
    action.triggerMetric,
    action.triggerValue,
  ])

  return BigInt(row!.id)
}

// ── Apply a queued change that was approved ────────────────

export async function processApprovedQueueItem(
  queueId: bigint,
  approvedBy: string,
  siteConfig: GHLSiteConfig,
): Promise<{ success: boolean; changeId?: bigint; errorMessage?: string }> {
  const item = await queryOne<{
    id: string
    site_id: string
    ghl_page_id: string
    action_type: string
    strategy: string | null
    reason: string
    expected_impact: string | null
    payload: unknown
    trigger_metric: string | null
    trigger_value: string | null
    status: string
  }>(`
    SELECT id, site_id, ghl_page_id, action_type, null AS strategy,
           reason, expected_impact, payload,
           trigger_metric, trigger_value, status
    FROM ghl_change_queue
    WHERE id = $1 AND status = 'approved'
  `, [queueId.toString()])

  if (!item) {
    return { success: false, errorMessage: `Queue item ${queueId} not found or not in approved state` }
  }

  // Re-assemble the AgentAction from queue data
  const action: AgentAction = {
    actionType:       item.action_type as any,
    strategy:         item.strategy as any ?? deriveStrategy(item.action_type),
    ghlPageId:        item.ghl_page_id,
    path:             '',                // not stored in queue; looked up below
    triggerIssue:     'low_ctr',         // not critical for execution
    triggerMetric:    item.trigger_metric ?? '',
    triggerValue:     parseFloat(item.trigger_value ?? '0'),
    triggerThreshold: 0,
    reason:           item.reason,
    expectedImpact:   item.expected_impact ?? '',
    impactScore:      0,                 // already cleared the gate
    payload:          item.payload as any,
  }

  // Look up the path from ghl_pages cache
  const page = await queryOne<{ path: string | null }>(`
    SELECT path FROM ghl_pages WHERE site_id = $1 AND ghl_page_id = $2
  `, [siteConfig.siteId, action.ghlPageId])
  action.path = page?.path ?? action.ghlPageId

  const client = new GHLClient({
    apiKey:     siteConfig.apiKey,
    locationId: siteConfig.locationId,
    apiVersion: siteConfig.apiVersion,
  })

  // Create backup before applying
  let backupId: bigint
  try {
    backupId = await createBackup(action, siteConfig.siteId)
  } catch (err) {
    const msg = `Backup failed: ${err instanceof Error ? err.message : String(err)}`
    log(`  ${msg}`)
    return { success: false, errorMessage: msg }
  }

  let changeId: bigint | undefined
  try {
    changeId = await logChangePending(action, siteConfig.siteId, backupId)
    await linkBackupToChange(backupId, changeId)
  } catch (err) {
    const msg = `Change log failed: ${err instanceof Error ? err.message : String(err)}`
    return { success: false, errorMessage: msg, changeId }
  }

  // Execute
  try {
    let success = false
    let newValue = ''
    let errorMessage: string | undefined

    switch (action.strategy) {
      case 'direct_api': {
        const r = await applyDirectApiUpdate(action, client, siteConfig.siteId)
        success = r.success
        newValue = JSON.stringify(r.appliedValues)
        errorMessage = r.errorMessage
        break
      }
      case 'script_injection': {
        const r = await applyScriptInjection(action, client, siteConfig.siteId)
        success = r.success && !r.skipped
        newValue = `injected ${r.target} code`
        errorMessage = r.errorMessage
        break
      }
      case 'html_patch': {
        const r = await applyHtmlPatch(action, client, siteConfig.siteId)
        success = r.success
        newValue = r.patchScript?.slice(0, 200) ?? ''
        errorMessage = r.errorMessage
        break
      }
      default:
        errorMessage = `Unknown strategy: ${action.strategy}`
    }

    if (!changeId) {
      return { success: false, errorMessage: 'Change ID missing — log step failed silently' }
    }

    if (success) {
      await logChangeApplied(changeId, newValue)
      await query(`
        UPDATE ghl_change_queue
        SET status = 'applied', approved_by = $2, approved_at = NOW(),
            applied_change_id = $3
        WHERE id = $1
      `, [queueId.toString(), approvedBy, changeId.toString()])
      log(`✓ Applied queued change ${queueId} (approved by ${approvedBy}) → change_id=${changeId}`)
      return { success: true, changeId }
    } else {
      await logChangeFailed(changeId, errorMessage ?? 'Unknown error')
      return { success: false, changeId, errorMessage }
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (changeId) await logChangeFailed(changeId, message).catch(() => {})
    return { success: false, changeId, errorMessage: message }
  }
}

// ── Approve a queued item ──────────────────────────────────

export async function approveQueueItem(
  queueId: bigint,
  approvedBy: string,
): Promise<void> {
  await query(`
    UPDATE ghl_change_queue
    SET status = 'approved', approved_by = $2, approved_at = NOW()
    WHERE id = $1 AND status = 'queued'
  `, [queueId.toString(), approvedBy])
}

// ── Reject a queued item ──────────────────────────────────

export async function rejectQueueItem(
  queueId: bigint,
  rejectedBy: string,
  reason: string,
): Promise<void> {
  await query(`
    UPDATE ghl_change_queue
    SET status = 'rejected', approved_by = $2, approved_at = NOW(),
        rejected_reason = $3
    WHERE id = $1 AND status = 'queued'
  `, [queueId.toString(), rejectedBy, reason])
}

// ── Expire stale queued items ─────────────────────────────

export async function expireStaleQueueItems(): Promise<number> {
  const rows = await query<{ id: string }>(`
    UPDATE ghl_change_queue
    SET status = 'expired'
    WHERE status = 'queued' AND expires_at < NOW()
    RETURNING id
  `)
  if (rows.length > 0) {
    log(`Expired ${rows.length} stale queue items`)
  }
  return rows.length
}

// ── List pending queue items for a site ───────────────────

export async function getPendingQueueItems(siteId: number): Promise<Array<{
  id: bigint
  ghlPageId: string
  actionType: string
  priority: string
  reason: string
  expectedImpact: string | null
  triggerMetric: string | null
  triggerValue: number | null
  createdAt: Date
  expiresAt: Date
}>> {
  const rows = await query<{
    id: string
    ghl_page_id: string
    action_type: string
    priority: string
    reason: string
    expected_impact: string | null
    trigger_metric: string | null
    trigger_value: string | null
    created_at: Date
    expires_at: Date
  }>(`
    SELECT id, ghl_page_id, action_type, priority, reason, expected_impact,
           trigger_metric, trigger_value, created_at, expires_at
    FROM ghl_change_queue
    WHERE site_id = $1 AND status = 'queued'
    ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      created_at ASC
  `, [siteId])

  return rows.map(r => ({
    id:             BigInt(r.id),
    ghlPageId:      r.ghl_page_id,
    actionType:     r.action_type,
    priority:       r.priority,
    reason:         r.reason,
    expectedImpact: r.expected_impact,
    triggerMetric:  r.trigger_metric,
    triggerValue:   r.trigger_value !== null ? parseFloat(r.trigger_value) : null,
    createdAt:      r.created_at,
    expiresAt:      r.expires_at,
  }))
}

// ── Helpers ────────────────────────────────────────────────

function deriveStrategy(actionType: string): 'direct_api' | 'script_injection' | 'html_patch' | 'fallback' {
  switch (actionType) {
    case 'update_meta_title':
    case 'update_meta_desc':
      return 'direct_api'
    case 'inject_schema':
    case 'inject_head_script':
    case 'inject_body_script':
      return 'script_injection'
    case 'update_page_title':
    case 'update_cta_text':
    case 'patch_html_section':
      return 'html_patch'
    default:
      return 'fallback'
  }
}

