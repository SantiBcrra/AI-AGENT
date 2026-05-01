// ============================================================
// GET /api/sites/[siteId]  — fetch a single site
// PUT /api/sites/[siteId]  — update site fields
// DELETE /api/sites/[siteId] — delete site
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

type RouteParams = { params: { siteId: string } }

// ── GET ───────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const id = parseInt(params.siteId, 10)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid site ID' }, { status: 400 })
  }

  const site = await queryOne<{
    id: number
    name: string
    domain: string
    tracking_id: string
    gsc_property: string | null
    timezone: string
    is_active: boolean
    created_at: string
    updated_at: string
    client_id: number
    client_name: string | null
    client_email: string | null
    ghl_location_id: string | null
    ghl_agent_enabled: boolean | null
    ghl_dry_run: boolean | null
  }>(`
    SELECT
      s.id, s.name, s.domain, s.tracking_id, s.gsc_property,
      s.timezone, s.is_active, s.created_at, s.updated_at,
      s.client_id, c.name AS client_name, c.email AS client_email,
      gs.location_id AS ghl_location_id,
      gs.agent_enabled AS ghl_agent_enabled,
      gs.dry_run AS ghl_dry_run
    FROM sites s
    LEFT JOIN clients c ON c.id = s.client_id
    LEFT JOIN ghl_sites gs ON gs.site_id = s.id
    WHERE s.id = $1
  `, [id])

  if (!site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  }

  return NextResponse.json({ site })
}

// ── PUT ───────────────────────────────────────────────────

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const id = parseInt(params.siteId, 10)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid site ID' }, { status: 400 })
  }

  let body: {
    name?: string
    domain?: string
    gscProperty?: string
    timezone?: string
    isActive?: boolean
    ghlLocationId?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }
    updates.push(`name = $${idx++}`)
    values.push(body.name.trim())
  }

  if (body.domain !== undefined) {
    const domain = body.domain
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')
      .toLowerCase()
      .trim()

    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 })
    }
    updates.push(`domain = $${idx++}`)
    values.push(domain)
  }

  if (body.gscProperty !== undefined) {
    updates.push(`gsc_property = $${idx++}`)
    values.push(body.gscProperty || null)
  }

  if (body.timezone !== undefined) {
    updates.push(`timezone = $${idx++}`)
    values.push(body.timezone || 'UTC')
  }

  if (body.isActive !== undefined) {
    updates.push(`is_active = $${idx++}`)
    values.push(Boolean(body.isActive))
  }

  if (updates.length === 0 && body.ghlLocationId === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    let site: { id: number; name: string; domain: string; updated_at: string } | null = null

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`)
      values.push(id)

      site = await queryOne<{ id: number; name: string; domain: string; updated_at: string }>(`
        UPDATE sites
        SET ${updates.join(', ')}
        WHERE id = $${idx}
        RETURNING id, name, domain, updated_at
      `, values)

      if (!site) {
        return NextResponse.json({ error: 'Site not found' }, { status: 404 })
      }
    }

    if (body.ghlLocationId !== undefined) {
      const locationId = body.ghlLocationId.trim()
      if (locationId) {
        await query(`
          INSERT INTO ghl_sites (site_id, location_id)
          VALUES ($1, $2)
          ON CONFLICT (site_id) DO UPDATE
            SET location_id = EXCLUDED.location_id,
                updated_at  = NOW()
        `, [id, locationId])
      } else {
        // empty string = remove GHL config
        await query(`DELETE FROM ghl_sites WHERE site_id = $1`, [id])
      }
    }

    return NextResponse.json({ site: site ?? { id } })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Domain already registered to another site' }, { status: 409 })
    }
    console.error('[API PUT /sites/:id]', msg)
    return NextResponse.json({ error: 'Failed to update site' }, { status: 500 })
  }
}

// ── DELETE ────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const id = parseInt(params.siteId, 10)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid site ID' }, { status: 400 })
  }

  try {
    const deleted = await queryOne<{ id: number }>(`
      DELETE FROM sites WHERE id = $1 RETURNING id
    `, [id])

    if (!deleted) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, deletedId: deleted.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[API DELETE /sites/:id]', msg)
    return NextResponse.json({ error: 'Failed to delete site' }, { status: 500 })
  }
}
