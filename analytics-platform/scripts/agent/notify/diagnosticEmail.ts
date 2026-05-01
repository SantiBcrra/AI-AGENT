// ============================================================
// Notificación por email — digest de diagnósticos del agente
//
// Se dispara tras diagnosePages() en el orchestrator.
// Configuración (.env):
//   AGENT_DIAGNOSTIC_NOTIFY_TO   — destinatarios, separados por coma (obligatorio para enviar)
//   AGENT_DIAGNOSTIC_EMAIL_ONLY_IF_ISSUES — default true; false = enviar aunque no haya issues
//
// Transporte (uno de los dos):
//   RESEND_API_KEY + AGENT_EMAIL_FROM  — API Resend (dominio/from verificado en resend.com)
//   AGENT_SMTP_HOST, AGENT_SMTP_PORT, AGENT_SMTP_USER, AGENT_SMTP_PASS, AGENT_EMAIL_FROM
// ============================================================

import nodemailer from 'nodemailer'
import type { PageDiagnosis } from '../types'

const log = (msg: string) => console.log(`[Notify] ${new Date().toISOString()} ${msg}`)

function recipients(): string[] {
  const raw = process.env.AGENT_DIAGNOSTIC_NOTIFY_TO ?? ''
  return raw.split(/[,;]/).map(s => s.trim()).filter(Boolean)
}

function onlyIfIssues(): boolean {
  return process.env.AGENT_DIAGNOSTIC_EMAIL_ONLY_IF_ISSUES !== 'false'
}

export function buildDiagnosticEmailBody(
  domain: string,
  dryRun: boolean,
  diagnoses: PageDiagnosis[],
): string {
  const lines: string[] = []
  lines.push(`Sitio: ${domain}`)
  lines.push(`Dry run: ${dryRun}`)
  lines.push(`Fecha (UTC): ${new Date().toISOString()}`)
  lines.push('')

  const withIssues = diagnoses.filter(d => d.issues.length > 0)
  lines.push(`Páginas analizadas: ${diagnoses.length}`)
  lines.push(`Páginas con al menos un hallazgo: ${withIssues.length}`)
  lines.push('')

  const sorted = [...withIssues].sort(
    (a, b) => b.metrics.underperformanceScore - a.metrics.underperformanceScore,
  )

  for (const d of sorted) {
    lines.push('────────────────────────────────────────')
    lines.push(`Ruta: ${d.metrics.path}`)
    lines.push(`Título: ${d.metrics.title ?? '(sin título)'}`)
    lines.push(
      `GHL: ${d.metrics.ghlPageId ? `mapeado (${d.metrics.ghlPageId})` : 'sin mapeo — el agente no puede aplicar cambios en GHL para esta ruta'}`,
    )
    lines.push(`Prioridad: ${d.priority} | Total issues: ${d.totalIssues} | needsAction: ${d.needsAction}`)
    lines.push(`Score bajo rendimiento: ${d.metrics.underperformanceScore}`)
    for (const issue of d.issues) {
      lines.push(`  • [${issue.severity}] ${issue.type} — ${issue.metric}=${issue.value} (umbral ${issue.threshold})`)
      lines.push(`    ${issue.message}`)
      lines.push(`    Acción sugerida: ${issue.suggestedAction}`)
    }
    lines.push('')
  }

  if (withIssues.length === 0) {
    lines.push('No hay hallazgos en las páginas analizadas en esta ejecución.')
  }

  return lines.join('\n')
}

async function sendViaResend(to: string[], subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.AGENT_EMAIL_FROM
  if (!key || !from) return false

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Resend HTTP ${res.status}: ${errBody.slice(0, 500)}`)
  }
  return true
}

async function sendViaSmtp(to: string[], subject: string, text: string): Promise<boolean> {
  const host = process.env.AGENT_SMTP_HOST
  const from = process.env.AGENT_EMAIL_FROM ?? process.env.AGENT_SMTP_USER
  const user = process.env.AGENT_SMTP_USER
  const pass = process.env.AGENT_SMTP_PASS
  if (!host || !from || !user || !pass) return false

  const port = parseInt(process.env.AGENT_SMTP_PORT ?? '587', 10)
  const secure = process.env.AGENT_SMTP_SECURE === 'true'

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })

  await transporter.sendMail({
    from,
    to: to.join(', '),
    subject,
    text,
  })
  return true
}

/**
 * Envía un correo con el resumen de diagnósticos del agente para un sitio.
 * No lanza si falla el envío (solo log), para no tumbar el cron.
 */
export async function sendAgentDiagnosticDigest(
  domain: string,
  dryRun: boolean,
  diagnoses: PageDiagnosis[],
): Promise<void> {
  const to = recipients()
  if (to.length === 0) {
    log('AGENT_DIAGNOSTIC_NOTIFY_TO no definido — omitiendo email')
    return
  }

  if (onlyIfIssues() && !diagnoses.some(d => d.issues.length > 0)) {
    log(`${domain}: sin hallazgos — omitiendo email (AGENT_DIAGNOSTIC_EMAIL_ONLY_IF_ISSUES=false para forzar envío)`)
    return
  }

  const issueCount = diagnoses.filter(d => d.issues.length > 0).length
  const subject =
    issueCount > 0
      ? `[Agent GHL] ${domain} — ${issueCount} página(s) con diagnósticos`
      : `[Agent GHL] ${domain} — ejecución sin hallazgos`

  const text = buildDiagnosticEmailBody(domain, dryRun, diagnoses)

  try {
    if (process.env.RESEND_API_KEY) {
      const viaResend = await sendViaResend(to, subject, text)
      if (viaResend) {
        log(`Email enviado (Resend) → ${to.join(', ')}`)
        return
      }
    }
    const smtpOk = await sendViaSmtp(to, subject, text)
    if (smtpOk) {
      log(`Email enviado (SMTP) → ${to.join(', ')}`)
      return
    }
    log(
      'No hay transporte válido: RESEND_API_KEY+AGENT_EMAIL_FROM, o AGENT_SMTP_HOST+AGENT_SMTP_USER+AGENT_SMTP_PASS+AGENT_EMAIL_FROM',
    )
  } catch (err) {
    log(`Error al enviar email: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Envía texto libre (mismo transporte que el digest). Útil cuando no hay page_stats suficientes. */
export async function sendAgentPlainDigest(
  domain: string,
  dryRun: boolean,
  subject: string,
  bodyLines: string[],
): Promise<void> {
  const to = recipients()
  if (to.length === 0) {
    log('AGENT_DIAGNOSTIC_NOTIFY_TO no definido — omitiendo email')
    return
  }

  const text = [`Sitio: ${domain}`, `Dry run: ${dryRun}`, `Fecha (UTC): ${new Date().toISOString()}`, '', ...bodyLines].join('\n')

  try {
    if (process.env.RESEND_API_KEY) {
      const viaResend = await sendViaResend(to, subject, text)
      if (viaResend) {
        log(`Email enviado (Resend) → ${to.join(', ')}`)
        return
      }
    }
    const smtpOk = await sendViaSmtp(to, subject, text)
    if (smtpOk) {
      log(`Email enviado (SMTP) → ${to.join(', ')}`)
      return
    }
    log(
      'No hay transporte válido: RESEND_API_KEY+AGENT_EMAIL_FROM, o AGENT_SMTP_* + AGENT_EMAIL_FROM',
    )
  } catch (err) {
    log(`Error al enviar email: ${err instanceof Error ? err.message : String(err)}`)
  }
}
