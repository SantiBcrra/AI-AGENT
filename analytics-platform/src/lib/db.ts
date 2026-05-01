// ============================================================
// Conexión a PostgreSQL — pool reutilizable
// ============================================================

import { Pool, PoolClient } from 'pg'

declare global {
  // Evita crear múltiples pools en desarrollo con hot-reload
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,                // máximo de conexiones simultáneas
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
  })

  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message)
  })

  return pool
}

export const db: Pool =
  global._pgPool ?? (global._pgPool = createPool())

// Helper: ejecutar una query con tipos
export async function query<T extends object = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await db.query<T>(sql, params)
  return result.rows
}

// Helper: obtener exactamente una fila
export async function queryOne<T extends object = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

// Helper: transacción
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
