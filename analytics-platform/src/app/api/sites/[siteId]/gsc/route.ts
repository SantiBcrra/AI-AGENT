// ============================================================
// PATCH /api/sites/[siteId]/gsc
// Guarda la propiedad GSC seleccionada por el usuario
//
// GET /api/sites/[siteId]/gsc
// Devuelve el estado de conexión GSC del sitio
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'

// ── GET: estado de conexión ──────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId)
  if (isNaN(siteId)) {
    return NextResponse.json({ error: 'siteId inválido' }, { status: 400 })
  }

  const site = await queryOne<{
    id: number
    domain: string
    gsc_property: string | null
    has_token: boolean
  }>(`
    SELECT
      id,
      domain,
      gsc_property,
      (gsc_token IS NOT NULL) AS has_token
    FROM sites
    WHERE id = $1 AND is_active = true
  `, [siteId])

  if (!site) {
    return NextResponse.json({ error: 'Sitio no encontrado' }, { status: 404 })
  }

  const connected = site.has_token && site.gsc_property !== null
  return NextResponse.json({
    connected,
    gsc_property: site.gsc_property,
    has_token:    site.has_token,
  })
}

// ── PATCH: guardar propiedad GSC seleccionada ────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId)
  if (isNaN(siteId)) {
    return NextResponse.json({ error: 'siteId inválido' }, { status: 400 })
  }

  let body: { gsc_property?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.gsc_property?.trim()) {
    return NextResponse.json({ error: 'gsc_property es requerida' }, { status: 400 })
  }

  // Validar formato: debe ser "sc-domain:ejemplo.com" o "https://ejemplo.com/"
  const prop = body.gsc_property.trim()
  const validFormat =
    /^sc-domain:[a-z0-9.-]+\.[a-z]{2,}$/i.test(prop) ||
    /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(prop)

  if (!validFormat) {
    return NextResponse.json(
      { error: 'Formato inválido. Usa "sc-domain:ejemplo.com" o "https://ejemplo.com/"' },
      { status: 400 }
    )
  }

  const site = await queryOne<{ id: number }>(
    `UPDATE sites SET gsc_property = $1, updated_at = NOW()
     WHERE id = $2 AND is_active = true
     RETURNING id`,
    [prop, siteId]
  )

  if (!site) {
    return NextResponse.json({ error: 'Sitio no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, gsc_property: prop })
}

// ── DELETE: desconectar GSC ──────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId)
  if (isNaN(siteId)) {
    return NextResponse.json({ error: 'siteId inválido' }, { status: 400 })
  }

  await queryOne(
    `UPDATE sites SET gsc_token = NULL, gsc_property = NULL, updated_at = NOW()
     WHERE id = $1`,
    [siteId]
  )

  return NextResponse.json({ ok: true, message: 'GSC desconectado' })
}
