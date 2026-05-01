// ============================================================
// Gmail API — captura emails de Google Search Console
// Requiere scope: https://www.googleapis.com/auth/gmail.readonly
// ============================================================

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

// Remitentes oficiales de Google Search Console
const GSC_SENDERS = [
  'search-console-noreply@google.com',
  'noreply@google.com',
  'webmaster-noreply@google.com',
]

interface GmailMessage {
  id:       string
  threadId: string
}

interface GmailFullMessage {
  id:      string
  payload: {
    headers: Array<{ name: string; value: string }>
    body:    { data?: string }
    parts?:  Array<{
      mimeType: string
      body:     { data?: string }
      parts?:   unknown[]
    }>
  }
  internalDate: string  // timestamp ms como string
}

// ── Obtener token de Gmail desde env ──────────────────────
// (Mismo OAuth2 que GSC, con scope gmail.readonly añadido)

async function getGmailToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) throw new Error('Gmail token refresh failed')
  const data = await res.json() as { access_token: string }
  return data.access_token
}

// ── Buscar mensajes de GSC en el inbox ────────────────────

export async function fetchGscEmails(
  sinceDays = 7
): Promise<GmailFullMessage[]> {
  const token    = await getGmailToken()
  const sinceTs  = Math.floor((Date.now() - sinceDays * 86400_000) / 1000)
  const senderQ  = GSC_SENDERS.map(s => `from:${s}`).join(' OR ')
  const query    = `(${senderQ}) after:${sinceTs}`

  // 1. Listar IDs de mensajes
  const listRes = await fetch(
    `${GMAIL_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!listRes.ok) return []

  const listData = await listRes.json() as { messages?: GmailMessage[] }
  const messages = listData.messages ?? []

  if (messages.length === 0) return []

  // 2. Obtener cada mensaje completo (en paralelo, máximo 5 a la vez)
  const full: GmailFullMessage[] = []

  for (let i = 0; i < messages.length; i += 5) {
    const batch = messages.slice(i, i + 5)
    const results = await Promise.all(
      batch.map(m =>
        fetch(`${GMAIL_BASE}/messages/${m.id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.ok ? r.json() as Promise<GmailFullMessage> : null)
      )
    )
    full.push(...results.filter(Boolean) as GmailFullMessage[])
  }

  return full
}

// ── Extraer el cuerpo del mensaje ─────────────────────────

export function extractEmailBody(msg: GmailFullMessage): string {
  // Intentar obtener text/plain primero, luego text/html
  function decode(data?: string): string {
    if (!data) return ''
    // Gmail usa base64url
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
    try {
      return Buffer.from(base64, 'base64').toString('utf8')
    } catch {
      return ''
    }
  }

  // Mensaje simple sin partes
  if (msg.payload.body?.data) {
    return decode(msg.payload.body.data)
  }

  // Mensaje con partes (multipart)
  const parts = msg.payload.parts ?? []

  const plain = parts.find(p => p.mimeType === 'text/plain')
  if (plain?.body?.data) return decode(plain.body.data)

  const html = parts.find(p => p.mimeType === 'text/html')
  if (html?.body?.data) {
    // Remover tags HTML básico para quedarnos con el texto
    return decode(html.body.data)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return ''
}

// ── Extraer headers del mensaje ───────────────────────────

export function extractEmailHeaders(msg: GmailFullMessage): {
  from:    string
  subject: string
  date:    Date
  messageId: string
} {
  const headers = msg.payload.headers
  const get = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

  return {
    from:      get('from'),
    subject:   get('subject'),
    date:      new Date(parseInt(msg.internalDate, 10)),
    messageId: msg.id,
  }
}
