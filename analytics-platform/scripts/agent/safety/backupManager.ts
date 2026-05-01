// ============================================================
// BACKUP MANAGER
// Creates and stores snapshots of GHL page state before
// any change is applied. Enables full rollback.
// ============================================================

import { query, queryOne } from '@/lib/db'
import type { AgentAction, BackupData } from '../types'

export async function createBackup(
  action: AgentAction,
  siteId: number,
): Promise<bigint> {
  const existing = await queryOne<{
    title: string | null
    meta_title: string | null
    meta_description: string | null
    head_code: string | null
    body_code: string | null
  }>(`
    SELECT title, meta_title, meta_description, head_code, body_code
    FROM ghl_pages WHERE site_id = $1 AND ghl_page_id = $2
  `, [siteId, action.ghlPageId])

  const backupData: BackupData = {
    ghlPageId:       action.ghlPageId,
    snapshotAt:      new Date().toISOString(),
    title:           existing?.title ?? null,
    metaTitle:       existing?.meta_title ?? null,
    metaDescription: existing?.meta_description ?? null,
    headCode:        existing?.head_code ?? null,
    bodyCode:        existing?.body_code ?? null,
  }

  const row = await queryOne<{ id: string }>(`
    INSERT INTO ghl_page_backups (site_id, ghl_page_id, backup_data, reason)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [
    siteId,
    action.ghlPageId,
    JSON.stringify(backupData),
    `before: ${action.actionType}`,
  ])

  return BigInt(row!.id)
}

export async function getBackup(backupId: bigint): Promise<BackupData | null> {
  const row = await queryOne<{ backup_data: BackupData }>(`
    SELECT backup_data FROM ghl_page_backups WHERE id = $1
  `, [backupId.toString()])

  return row?.backup_data ?? null
}

export async function linkBackupToChange(
  backupId: bigint,
  changeId: bigint,
): Promise<void> {
  await query(`
    UPDATE ghl_page_backups SET change_id = $1 WHERE id = $2
  `, [changeId.toString(), backupId.toString()])
}
