// Script de prueba: lee config GHL de la DB y verifica la conexión
import { Pool } from 'pg'

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

interface GhlSiteRow {
  site_id: number
  location_id: string
  api_key: string
  api_version: string
  agent_enabled: boolean
  dry_run: boolean
}

async function testGhlConnection() {
  console.log('=== Test de conexión GoHighLevel ===\n')

  // 1. Verificar conexión a la DB
  console.log('1. Conectando a PostgreSQL...')
  let configs: GhlSiteRow[]
  try {
    const result = await db.query<GhlSiteRow>(
      'SELECT site_id, location_id, api_key, api_version, agent_enabled, dry_run FROM ghl_sites LIMIT 10'
    )
    configs = result.rows
    console.log(`   ✓ Conexión OK — ${configs.length} sitio(s) GHL encontrado(s)\n`)
  } catch (err) {
    const e = err as Error
    console.error(`   ✗ Error de DB: ${e.message}`)
    process.exit(1)
  }

  if (configs.length === 0) {
    console.log('   ⚠ No hay registros en ghl_sites. Inserta uno primero:\n')
    console.log(`   INSERT INTO ghl_sites (site_id, location_id, api_key, dry_run)`)
    console.log(`   VALUES (<site_id>, '<Location ID>', '<API Key>', true);\n`)
    process.exit(0)
  }

  // 2. Probar cada configuración encontrada
  for (const config of configs) {
    console.log(`2. Probando site_id=${config.site_id}`)
    console.log(`   Location ID: ${config.location_id}`)
    console.log(`   API Key:     ${config.api_key.slice(0, 8)}...${config.api_key.slice(-4)}`)
    console.log(`   Version:     ${config.api_version}`)
    console.log(`   Agente:      ${config.agent_enabled ? 'habilitado' : 'deshabilitado'} | dry_run: ${config.dry_run}`)

    // Llamada simple: obtener info de la location
    const url = `https://services.leadconnectorhq.com/locations/${config.location_id}`
    console.log(`\n   GET ${url}`)

    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${config.api_key}`,
          'Version': config.api_version ?? '2021-07-28',
          'Accept': 'application/json',
        },
      })

      const body = await res.text()
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(body) } catch { /* not json */ }

      if (res.ok) {
        const loc = (parsed.location ?? parsed) as Record<string, unknown>
        console.log(`   ✓ HTTP ${res.status} — Conexión exitosa!`)
        console.log(`   Nombre:  ${loc.name ?? '(no disponible)'}`)
        console.log(`   Email:   ${loc.email ?? '(no disponible)'}`)
        console.log(`   Phone:   ${loc.phone ?? '(no disponible)'}`)
        console.log(`   Country: ${loc.country ?? '(no disponible)'}`)
      } else {
        console.log(`   ✗ HTTP ${res.status} — Error de API`)
        console.log(`   Respuesta: ${body.slice(0, 300)}`)

        if (res.status === 401) {
          console.log('\n   → Token inválido o expirado. Verifica el API Key en GHL:')
          console.log('     Settings → API Keys → crear una nueva Full Access key')
        } else if (res.status === 403) {
          console.log('\n   → Sin permisos. El API Key no tiene acceso a esta Location.')
        } else if (res.status === 404) {
          console.log('\n   → Location ID no encontrado. Verifica en GHL:')
          console.log('     Settings → Business Info → Location ID')
        }
      }
    } catch (err) {
      const e = err as Error
      console.error(`   ✗ Error de red: ${e.message}`)
    }

    console.log('')
  }

  await db.end()
}

testGhlConnection().catch(console.error)
