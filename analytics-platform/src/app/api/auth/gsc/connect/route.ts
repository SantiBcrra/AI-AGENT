// ============================================================
// GET /api/auth/gsc/connect?siteId=X
//
// Inicia el flujo OAuth2 con Google Search Console.
// Redirige al usuario a la pantalla de login de Google.
//
// Pasos:
//  1. Recibe siteId
//  2. Genera nonce anti-CSRF
//  3. Guarda { nonce, siteId } en cookie httpOnly (10 min)
//  4. Redirige a Google OAuth
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { queryOne } from '@/lib/db'

// Permisos mínimos necesarios para GSC
const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
].join(' ')

export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get('siteId')

  if (!siteId || isNaN(parseInt(siteId))) {
    return NextResponse.json({ error: 'siteId inválido' }, { status: 400 })
  }

  // Verificar que el sitio existe en la BD
  const site = await queryOne<{ id: number }>(
    'SELECT id FROM sites WHERE id = $1 AND is_active = true',
    [parseInt(siteId)]
  )

  if (!site) {
    return NextResponse.json({ error: 'Sitio no encontrado' }, { status: 404 })
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID no está configurado en las variables de entorno' },
      { status: 500 }
    )
  }

  // Nonce aleatorio para prevenir CSRF
  const nonce = crypto.randomUUID()

  // Guardar estado en cookie httpOnly (expira en 10 minutos)
  const cookieStore = cookies()
  cookieStore.set('_gsc_oauth', JSON.stringify({ nonce, siteId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,   // 10 minutos
    path: '/',
  })

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/gsc/callback`

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',   // necesario para obtener refresh_token
    prompt:        'consent',   // fuerza que Google devuelva refresh_token siempre
    state:         nonce,
  })

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

  return NextResponse.redirect(googleAuthUrl)
}
