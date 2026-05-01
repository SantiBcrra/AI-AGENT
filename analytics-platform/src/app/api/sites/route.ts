// ============================================================
// GET  /api/sites — List all sites with basic stats
// POST /api/sites — Create a new site
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

// ── GET ───────────────────────────────────────────────────

export async function GET() {
  const sites = await query<{
    id: number
    name: string
    domain: string
    tracking_id: string
    gsc_property: string | null
    timezone: string
    is_active: boolean
    created_at: string
    client_name: string | null
    total_visits_7d: string
    total_sessions_7d: string
  }>(`
    SELECT
      s.id, s.name, s.domain, s.tracking_id,
      s.gsc_property, s.timezone, s.is_active, s.created_at,
      c.name AS client_name,
      COALESCE(SUM(psd.unique_visits), 0)::TEXT  AS total_visits_7d,
      COALESCE(SUM(psd.sessions), 0)::TEXT        AS total_sessions_7d
    FROM sites s
    LEFT JOIN clients c ON c.id = s.client_id
    LEFT JOIN page_stats_daily psd
      ON psd.site_id = s.id
      AND psd.stat_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY s.id, s.name, s.domain, s.tracking_id,
             s.gsc_property, s.timezone, s.is_active, s.created_at,
             c.name
    ORDER BY s.created_at DESC
  `)

  return NextResponse.json({ sites })
}



function generateTrackingId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = 'trk_'
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

export async function POST(request: NextRequest) {
  let body: { name?: string; domain?: string; clientId?: number }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.name?.trim() || !body.domain?.trim()) {
    return NextResponse.json({ error: 'name and domain are required' }, { status: 400 })
  }

  // Normalizar dominio (quitar protocolo y slash final)
  const domain = body.domain
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
    .trim()

  // Validación básica de dominio
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 })
  }

  const requestedClientId = body.clientId ?? null
  const trackingId = generateTrackingId()

  try {
    let clientId: number

    if (requestedClientId) {
      const existingClient = await queryOne<{ id: number }>(
        `SELECT id FROM clients WHERE id = $1 LIMIT 1`,
        [requestedClientId]
      )
      if (!existingClient) {
        return NextResponse.json({ error: 'El cliente seleccionado no existe' }, { status: 400 })
      }
      clientId = existingClient.id
    } else {
      const fallbackClient = await queryOne<{ id: number }>(
        `SELECT id FROM clients ORDER BY id ASC LIMIT 1`
      )

      if (fallbackClient) {
        clientId = fallbackClient.id
      } else {
        // Seed mínimo para evitar 500 en proyectos recién desplegados.
        const createdClient = await queryOne<{ id: number }>(`
          INSERT INTO clients (name, email, company, plan)
          VALUES ('Default Client', 'default-client@nexphaz.local', 'Nexphaz', 'basic')
          RETURNING id
        `)

        if (!createdClient) {
          throw new Error('No se pudo crear cliente por defecto')
        }
        clientId = createdClient.id
      }
    }

    const site = await queryOne<{ id: number; tracking_id: string; domain: string }>(`
      INSERT INTO sites (client_id, name, domain, tracking_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, tracking_id, domain
    `, [clientId, body.name.trim(), domain, trackingId])

    return NextResponse.json({ site }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Este dominio ya está registrado' }, { status: 409 })
    }
    console.error('[API /sites] Error creating site:', msg)
    return NextResponse.json({ error: 'Error interno al crear el sitio' }, { status: 500 })
  }
}
