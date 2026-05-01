// ============================================================
// GET /api/auth/gsc/callback
//
// Recibe el redirect de Google tras el login OAuth2.
// Pasos:
//  1. Valida el state contra la cookie anti-CSRF
//  2. Intercambia el code por access_token + refresh_token
//  3. Llama a la GSC Sites API para listar las propiedades del usuario
//  4. Guarda los tokens en sites.gsc_token
//  5. Redirige al usuario al selector de propiedad GSC
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/db'

interface GoogleTokenResponse {
  access_token:   string
  refresh_token?: string
  expires_in:     number
  token_type:     string
  scope?:         string
}

interface GSCProperty {
  siteUrl:        string
  permissionLevel: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code       = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const baseUrl = process.env.NEXTAUTH_URL!

  // ── Google devolvió un error (ej: usuario rechazó permisos) ─
  if (errorParam) {
    const msg = errorParam === 'access_denied'
      ? 'Cancelaste la autorización de Google'
      : errorParam
    return NextResponse.redirect(
      `${baseUrl}/dashboard/new?error=${encodeURIComponent(msg)}`
    )
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${baseUrl}/dashboard/new?error=missing_params`)
  }

  // ── Validar state contra cookie ──────────────────────────────
  const cookieStore = cookies()
  const rawCookie   = cookieStore.get('_gsc_oauth')?.value

  if (!rawCookie) {
    return NextResponse.redirect(`${baseUrl}/dashboard/new?error=session_expired`)
  }

  let oauthState: { nonce: string; siteId: string }
  try {
    oauthState = JSON.parse(rawCookie)
  } catch {
    return NextResponse.redirect(`${baseUrl}/dashboard/new?error=invalid_state`)
  }

  if (oauthState.nonce !== stateParam) {
    return NextResponse.redirect(`${baseUrl}/dashboard/new?error=state_mismatch`)
  }

  // Cookie validada — eliminarla
  cookieStore.delete('_gsc_oauth')

  const { siteId } = oauthState
  const redirectUri = `${baseUrl}/api/auth/gsc/callback`

  // ── Intercambiar code por tokens ─────────────────────────────
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text()
    console.error('[GSC OAuth] Token exchange failed:', errText)
    return NextResponse.redirect(
      `${baseUrl}/dashboard/new?error=token_exchange_failed&siteId=${siteId}`
    )
  }

  const tokens = await tokenRes.json() as GoogleTokenResponse

  // Si no hay refresh_token, el usuario ya autorizó antes sin prompt=consent.
  // Esto no debería pasar con prompt=consent, pero por seguridad lo manejamos.
  if (!tokens.refresh_token) {
    console.error('[GSC OAuth] No refresh_token received')
    return NextResponse.redirect(
      `${baseUrl}/dashboard/new?error=no_refresh_token&siteId=${siteId}&hint=revoke_access`
    )
  }

  const gscToken = {
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date:   Date.now() + tokens.expires_in * 1000,
    token_type:    tokens.token_type,
  }

  // ── Guardar tokens en la BD ──────────────────────────────────
  await query(
    `UPDATE sites SET gsc_token = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(gscToken), parseInt(siteId)]
  )

  // ── Obtener propiedades GSC del usuario ──────────────────────
  // Para que el usuario pueda elegir cuál propiedad corresponde a este sitio
  let properties: GSCProperty[] = []
  try {
    const propsRes = await fetch(
      'https://www.googleapis.com/webmasters/v3/sites',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    )
    if (propsRes.ok) {
      const data = await propsRes.json() as { siteEntry?: GSCProperty[] }
      properties = data.siteEntry ?? []
    }
  } catch (err) {
    console.warn('[GSC OAuth] Could not fetch properties:', err)
    // No bloqueamos el flujo — el usuario puede configurarlo después
  }

  // Guardar propiedades disponibles temporalmente en cookie para la UI
  if (properties.length > 0) {
    cookieStore.set('_gsc_properties', JSON.stringify(properties), {
      httpOnly: false,  // necesita ser leída por JS en el cliente
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300,   // 5 minutos para completar la selección
      path: '/',
    })
  }

  // Redirigir al selector de propiedad
  return NextResponse.redirect(
    `${baseUrl}/dashboard/new?step=select-property&siteId=${siteId}&gsc=connected&count=${properties.length}`
  )
}
