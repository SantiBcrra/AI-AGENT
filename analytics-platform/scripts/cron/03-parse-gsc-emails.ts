#!/usr/bin/env tsx
// ============================================================
// CRON 03 — Captura y parseo de emails de Google Search Console
// Horario: cada 6 horas (0 */6 * * *)
// Qué hace:
//   - Lee inbox de Gmail buscando emails de Google
//   - Parsea cada email con Claude para extraer tipo, severidad y acción
//   - Guarda en gsc_email_alerts y dispara system_alerts si es crítico
// ============================================================

import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import { fetchGscEmails, extractEmailBody, extractEmailHeaders } from '@/lib/gmail/client'
import { query, queryOne } from '@/lib/db'

const log = (msg: string) => console.log(`[MAIL] ${new Date().toISOString()} ${msg}`)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Parsear email con Claude ───────────────────────────────

interface ParsedEmail {
  alert_type:      string
  severity:        string
  summary:         string
  affected_urls:   string[]
  action_required: string
  deadline:        string | null
}

async function parseEmailWithClaude(
  subject: string,
  body: string
): Promise<ParsedEmail> {
  const prompt = `Analiza este email de Google Search Console y extrae la información estructurada.

ASUNTO: ${subject}

CUERPO:
${body.slice(0, 3000)}

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "alert_type": "<uno de: coverage|manual_action|security|sitemap|mobile|core_update|rich_result|performance|other>",
  "severity": "<uno de: critical|high|medium|low|info>",
  "summary": "<resumen en 1-2 oraciones en español de qué pasó>",
  "affected_urls": ["<url1>", "<url2>"],
  "action_required": "<qué debe hacer el administrador, en español, o null si es solo informativo>",
  "deadline": "<fecha YYYY-MM-DD si hay plazo, o null>"
}

Criterios de severidad:
- critical: acción manual, malware, phishing, hacking
- high: caída grande de tráfico, error de cobertura masivo, problema de seguridad
- medium: warnings de rich results, errores de sitemap, problemas de mobile
- low: actualizaciones informativas, mejoras sugeridas
- info: notificaciones generales sin impacto negativo`

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',  // más rápido y barato para parseo
      max_tokens: 512,
      messages:   [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    // Extraer solo el JSON (Claude a veces añade texto antes/después)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    return JSON.parse(jsonMatch[0]) as ParsedEmail

  } catch (err) {
    log(`  Warning: Claude parse failed, using defaults. ${err instanceof Error ? err.message : ''}`)
    // Fallback: extraer info básica por reglas
    return {
      alert_type:      detectAlertType(subject),
      severity:        detectSeverity(subject, body),
      summary:         subject,
      affected_urls:   [],
      action_required: 'Revisar Google Search Console para más detalles.',
      deadline:        null,
    }
  }
}

// ── Detección de tipo y severidad por reglas (fallback) ───

function detectAlertType(subject: string): string {
  const s = subject.toLowerCase()
  if (s.includes('manual') || s.includes('spam'))      return 'manual_action'
  if (s.includes('security') || s.includes('hack') ||
      s.includes('malware'))                            return 'security'
  if (s.includes('sitemap'))                            return 'sitemap'
  if (s.includes('coverage') || s.includes('index'))   return 'coverage'
  if (s.includes('mobile') || s.includes('usabilidad')) return 'mobile'
  if (s.includes('rich') || s.includes('fragment'))    return 'rich_result'
  if (s.includes('performance') || s.includes('traffic')) return 'performance'
  return 'other'
}

function detectSeverity(subject: string, body: string): string {
  const text = (subject + ' ' + body).toLowerCase()
  if (text.includes('manual action') || text.includes('malware') ||
      text.includes('phishing') || text.includes('hacked'))    return 'critical'
  if (text.includes('significant') || text.includes('error') ||
      text.includes('dropped'))                                 return 'high'
  if (text.includes('warning') || text.includes('issue'))      return 'medium'
  return 'low'
}

// ── Relacionar email con un sitio por dominio ─────────────

async function matchSiteFromEmail(
  body: string,
  subject: string
): Promise<number | null> {
  // Buscar dominios mencionados en el email
  const domainRegex = /(?:https?:\/\/)?(?:sc-domain:)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
  const mentioned   = new Set<string>()

  for (const match of [...(body + subject).matchAll(domainRegex)]) {
    mentioned.add(match[1].toLowerCase().replace(/^www\./, ''))
  }

  if (mentioned.size === 0) return null

  // Buscar en la BD qué site_id corresponde
  const site = await queryOne<{ id: number }>(`
    SELECT id FROM sites
    WHERE domain = ANY($1::text[]) AND is_active = true
    LIMIT 1
  `, [[...mentioned]])

  return site?.id ?? null
}

// ── Runner principal ───────────────────────────────────────

async function main() {
  log('=== Starting GSC email parsing ===')

  // Obtener emails de los últimos 7 días
  log('Fetching emails from Gmail...')
  const emails = await fetchGscEmails(7)
  log(`Found ${emails.length} email(s) from Google`)

  let saved = 0
  let skipped = 0

  for (const email of emails) {
    const headers = extractEmailHeaders(email)
    const body    = extractEmailBody(email)

    // Verificar si ya lo procesamos (evitar duplicados)
    const exists = await queryOne<{ id: number }>(`
      SELECT id FROM gsc_email_alerts WHERE gmail_message_id = $1
    `, [headers.messageId])

    if (exists) {
      skipped++
      continue
    }

    log(`  Parsing: "${headers.subject}"`)

    // Parsear con Claude
    const parsed = await parseEmailWithClaude(headers.subject, body)

    // Intentar asociar con un sitio
    const siteId = await matchSiteFromEmail(body, headers.subject)

    // Guardar en BD
    await query(`
      INSERT INTO gsc_email_alerts (
        site_id, gmail_message_id, sender, subject, received_at, raw_body,
        alert_type, severity, summary, affected_urls, action_required,
        deadline, status, parsed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'unread',NOW())
    `, [
      siteId,
      headers.messageId,
      headers.from,
      headers.subject,
      headers.date,
      body.slice(0, 10000),
      parsed.alert_type,
      parsed.severity,
      parsed.summary,
      JSON.stringify(parsed.affected_urls),
      parsed.action_required,
      parsed.deadline ? new Date(parsed.deadline) : null,
    ])

    // Si es crítico o alto, crear también una system_alert
    if (siteId && ['critical', 'high'].includes(parsed.severity)) {
      await query(`
        INSERT INTO system_alerts (
          site_id, alert_type, severity, title, message, context_data
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        siteId,
        parsed.alert_type,
        parsed.severity,
        `GSC Email: ${headers.subject}`,
        parsed.summary,
        JSON.stringify({
          gmail_message_id: headers.messageId,
          action_required:  parsed.action_required,
          affected_urls:    parsed.affected_urls,
        }),
      ])
    }

    saved++
    log(`  ✓ Saved (${parsed.severity}) → ${parsed.alert_type}`)

    // Pequeña pausa para no agotar la API de Claude
    await new Promise(r => setTimeout(r, 500))
  }

  log(`=== Email parsing done: ${saved} saved, ${skipped} skipped (already processed) ===`)
  process.exit(0)
}

main().catch(err => {
  console.error('[MAIL] Fatal error:', err)
  process.exit(1)
})
