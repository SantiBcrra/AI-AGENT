// ============================================================
// CHANGE LOGGER
// Persists every action the agent takes into ghl_changes.
// Also handles rollback by restoring from ghl_page_backups.
// ============================================================

import { query, queryOne } from '@/lib/db'
import type { AgentAction } from '../types'
import { GHLClient } from '../action/ghl/ghlClient'
import { rollbackInjection } from '../action/strategies/scriptInjectionStrategy'
import { getBackup } from './backupManager'

const log = (msg: string) => console.log(`[ChangeLog] ${new Date().toISOString()} ${msg}`)

// ── Log a pending change (before attempting to apply it) ──

export async function logChangePending(
  action: AgentAction,
  siteId: number,
  backupId: bigint,
): Promise<bigint> {
  const row = await queryOne<{ id: string }>(`
    INSERT INTO ghl_changes (
      site_id, ghl_page_id,
      action_type, strategy,
      trigger_metric, trigger_value, trigger_threshold,
      reason, expected_impact,
      payload, previous_value,
      status, backup_id,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12, NOW())
    RETURNING id
  `, [
    siteId,
    action.ghlPageId,
    action.actionType,
    action.strategy,
    action.triggerMetric,
    action.triggerValue,
    action.triggerThreshold,
    action.reason,
    action.expectedImpact,
    JSON.stringify(action.payload),
    action.previousValue ?? null,
    backupId.toString(),
  ])

  return BigInt(row!.id)
}

// ── Mark change as applied ─────────────────────────────────

export async function logChangeApplied(
  changeId: bigint,
  newValue: string,
): Promise<void> {
  await query(`
    UPDATE ghl_changes
    SET status = 'applied', applied_at = NOW(), new_value = $2
    WHERE id = $1
  `, [changeId.toString(), newValue])
}

// ── Mark change as failed ──────────────────────────────────

export async function logChangeFailed(
  changeId: bigint,
  errorMessage: string,
): Promise<void> {
  await query(`
    UPDATE ghl_changes
    SET status = 'failed', error_message = $2
    WHERE id = $1
  `, [changeId.toString(), errorMessage])
}

// ── Mark as dry-run (simulated, not applied) ──────────────

export async function logChangeDryRun(
  changeId: bigint,
  simulatedValue: string,
): Promise<void> {
  await query(`
    UPDATE ghl_changes
    SET status = 'dry_run', new_value = $2, applied_at = NOW()
    WHERE id = $1
  `, [changeId.toString(), simulatedValue])
}

// ── Rollback a specific change ────────────────────────────

export async function rollbackChange(
  changeId: bigint,
  client: GHLClient,
  siteId: number,
): Promise<{ success: boolean; error?: string }> {
  const change = await queryOne<{
    ghl_page_id: string
    action_type: string
    backup_id: string | null
    status: string
  }>(`
    SELECT ghl_page_id, action_type, backup_id, status
    FROM ghl_changes WHERE id = $1
  `, [changeId.toString()])

  if (!change) {
    return { success: false, error: `Change ${changeId} not found` }
  }

  if (change.status === 'rolled_back') {
    return { success: false, error: 'Change already rolled back' }
  }

  if (!change.backup_id) {
    return { success: false, error: 'No backup available for rollback' }
  }

  const backup = await getBackup(BigInt(change.backup_id))
  if (!backup) {
    return { success: false, error: 'Backup data not found' }
  }

  try {
    // Restore based on action type
    const actionType = change.action_type

    if (actionType === 'update_meta_title' || actionType === 'update_meta_desc') {
      // Restore meta via direct API
      const pageType = await queryOne<{ ghl_page_type: string }>(`
        SELECT ghl_page_type FROM ghl_pages
        WHERE site_id = $1 AND ghl_page_id = $2
      `, [siteId, change.ghl_page_id])

      if (pageType?.ghl_page_type === 'funnel') {
        await client.updateFunnelPage(change.ghl_page_id, {
          title:           backup.metaTitle ?? '',
          metaDescription: backup.metaDescription ?? '',
        })
      } else if (pageType?.ghl_page_type === 'website' || pageType?.ghl_page_type === 'landing') {
        await client.updateSitePage(change.ghl_page_id, {
          title:           backup.metaTitle ?? '',
          metaDescription: backup.metaDescription ?? '',
        })
      }

      // Restore cache
      await query(`
        UPDATE ghl_pages
        SET meta_title = $3, meta_description = $4, updated_at = NOW()
        WHERE site_id = $1 AND ghl_page_id = $2
      `, [siteId, change.ghl_page_id, backup.metaTitle, backup.metaDescription])

    } else if (
      actionType === 'inject_schema' ||
      actionType === 'inject_head_script' ||
      actionType === 'inject_body_script' ||
      actionType === 'update_cta_text' ||
      actionType === 'update_page_title' ||
      actionType === 'patch_html_section'
    ) {
      // Restore head/body code
      await rollbackInjection(change.ghl_page_id, backup, client, siteId)
    }

    await query(`
      UPDATE ghl_changes SET status = 'rolled_back' WHERE id = $1
    `, [changeId.toString()])

    log(`✓ Rolled back change ${changeId} on page ${change.ghl_page_id}`)
    return { success: true }

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log(`✗ Rollback failed for change ${changeId}: ${error}`)
    return { success: false, error }
  }
}

// ── List recent changes for a site ────────────────────────

export async function getRecentChanges(
  siteId: number,
  limit = 20,
): Promise<Array<{
  id: string
  ghlPageId: string
  actionType: string
  status: string
  reason: string
  appliedAt: Date | null
  wasEffective: boolean | null
}>> {
  const rows = await query<{
    id: string
    ghl_page_id: string
    action_type: string
    status: string
    reason: string
    applied_at: Date | null
    was_effective: boolean | null
  }>(`
    SELECT id, ghl_page_id, action_type, status, reason, applied_at, was_effective
    FROM ghl_changes
    WHERE site_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [siteId, limit])

  return rows.map(r => ({
    id: r.id,
    ghlPageId: r.ghl_page_id,
    actionType: r.action_type,
    status: r.status,
    reason: r.reason,
    appliedAt: r.applied_at,
    wasEffective: r.was_effective,
  }))
}
