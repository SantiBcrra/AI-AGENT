'use client'

// ============================================================
// /dashboard/new — Alta de nuevo sitio + conexión GSC
//
// Flujo en 3 pasos:
//  1. Formulario: nombre + dominio → POST /api/sites
//  2. Conectar Google Search Console (OAuth)
//  3. Seleccionar propiedad GSC + confirmar
// ============================================================

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

// ── Tipos ────────────────────────────────────────────────────

interface CreatedSite {
  id: number
  tracking_id: string
  domain: string
}

interface GSCProperty {
  siteUrl: string
  permissionLevel: string
}

// ── Paso 1: Formulario de creación de sitio ──────────────────

function StepCreateSite({ onCreated }: { onCreated: (site: CreatedSite) => void }) {
  const [name,   setName]   = useState('')
  const [domain, setDomain] = useState('')
  const [error,  setError]  = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, domain }),
      })

      const data = await res.json() as { site?: CreatedSite; error?: string }

      if (!res.ok) {
        setError(data.error ?? 'Error al crear el sitio')
        return
      }

      if (data.site) {
        onCreated(data.site)
      }
    } catch {
      setError('Error de conexión. Verifica que el servidor esté corriendo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
        Paso 1 — Registrar dominio
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Ingresa el nombre y dominio del sitio que quieres monitorear.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Nombre del sitio
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Tienda Principal"
            required
            className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-muted px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Dominio
          </label>
          <input
            type="text"
            value={domain}
            onChange={e => setDomain(e.target.value)}
            placeholder="ejemplo.com"
            required
            className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-muted px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <p className="mt-1 text-xs text-slate-400">Sin &quot;https://&quot; ni &quot;www&quot;, solo el dominio base.</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Creando sitio…' : 'Crear sitio →'}
        </button>
      </form>
    </div>
  )
}

// ── Paso 2: Conectar GSC ─────────────────────────────────────

function StepConnectGSC({
  site,
  onSkip,
}: {
  site: CreatedSite
  onSkip: () => void
}) {
  const snippetCode = `<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/tracker.js"
        data-site="${site.tracking_id}" async></script>`

  return (
    <div>
      <div className="mb-6 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3">
        <p className="text-sm font-medium text-green-800 dark:text-green-300">
          ✓ Sitio creado — <span className="font-mono">{site.domain}</span>
        </p>
      </div>

      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
        Paso 2 — Instalar el script de seguimiento
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Añade este snippet en el <code className="text-xs bg-slate-100 dark:bg-dark-muted px-1 py-0.5 rounded">&lt;head&gt;</code> de tu sitio para capturar pageviews, clics y eventos.
      </p>

      <pre className="mb-6 rounded-lg bg-slate-900 text-green-400 text-xs p-4 overflow-x-auto whitespace-pre-wrap break-all">
        {snippetCode}
      </pre>

      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
        Paso 3 — Conectar Google Search Console
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Autoriza el acceso a tu cuenta de Google para importar clicks, impresiones,
        CTR, posición, keywords, sitemaps e indexación directamente desde GSC.
      </p>

      <div className="space-y-3">
        <a
          href={`/api/auth/gsc/connect?siteId=${site.id}`}
          className="flex items-center justify-center gap-3 w-full rounded-lg border-2 border-slate-200 dark:border-dark-border bg-white dark:bg-dark-muted px-4 py-3 text-sm font-medium text-slate-900 dark:text-white hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-dark-muted/70 transition-all"
        >
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Conectar con Google Search Console
        </a>

        <button
          onClick={onSkip}
          className="w-full rounded-lg px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          Omitir por ahora → ir al dashboard
        </button>
      </div>

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Solo se solicita permiso de <strong>lectura</strong>. No se realizan cambios en tu propiedad de GSC.
        Puedes revocar el acceso en cualquier momento desde tu cuenta de Google.
      </p>
    </div>
  )
}

// ── Paso 3: Seleccionar propiedad GSC ────────────────────────

function StepSelectProperty({
  siteId,
  onDone,
}: {
  siteId: string
  onDone: () => void
}) {
  const [properties, setProperties] = useState<GSCProperty[]>([])
  const [selected, setSelected]     = useState('')
  const [manual,   setManual]       = useState('')
  const [useManual, setUseManual]   = useState(false)
  const [saving,   setSaving]       = useState(false)
  const [error,    setError]        = useState('')

  // Leer propiedades desde la cookie que dejó el callback
  useEffect(() => {
    try {
      const match = document.cookie.match(/_gsc_properties=([^;]+)/)
      if (match) {
        const decoded = decodeURIComponent(match[1])
        const parsed = JSON.parse(decoded) as GSCProperty[]
        setProperties(parsed)
        // Eliminar la cookie
        document.cookie = '_gsc_properties=; Max-Age=0; path=/'
      }
    } catch {
      // sin propiedades en cookie
    }
  }, [])

  async function handleSave() {
    const prop = useManual ? manual.trim() : selected
    if (!prop) {
      setError('Selecciona o ingresa una propiedad GSC')
      return
    }

    setSaving(true)
    setError('')

    try {
      const res = await fetch(`/api/sites/${siteId}/gsc`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gsc_property: prop }),
      })

      const data = await res.json() as { ok?: boolean; error?: string }

      if (!res.ok) {
        setError(data.error ?? 'Error al guardar la propiedad')
        return
      }

      onDone()
    } catch {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-6 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3">
        <p className="text-sm font-medium text-green-800 dark:text-green-300">
          ✓ Google Search Console conectado correctamente
        </p>
      </div>

      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
        Paso 4 — Seleccionar propiedad GSC
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
        Elige cuál propiedad de tu cuenta de Google Search Console corresponde a este sitio.
      </p>

      {properties.length > 0 && !useManual ? (
        <div className="space-y-2 mb-4">
          {properties.map((p) => (
            <label
              key={p.siteUrl}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-all ${
                selected === p.siteUrl
                  ? 'border-slate-900 dark:border-white bg-slate-50 dark:bg-dark-muted'
                  : 'border-slate-200 dark:border-dark-border hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="gsc_property"
                value={p.siteUrl}
                checked={selected === p.siteUrl}
                onChange={() => setSelected(p.siteUrl)}
                className="accent-slate-900 dark:accent-white"
              />
              <div>
                <p className="text-sm font-mono text-slate-900 dark:text-white">{p.siteUrl}</p>
                <p className="text-xs text-slate-400">{p.permissionLevel}</p>
              </div>
            </label>
          ))}

          <button
            onClick={() => setUseManual(true)}
            className="mt-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
          >
            No aparece mi propiedad → ingresar manualmente
          </button>
        </div>
      ) : (
        <div className="mb-4">
          {properties.length === 0 && (
            <p className="text-sm text-slate-400 mb-3">
              No se encontraron propiedades automáticamente. Ingrésala manualmente.
            </p>
          )}
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Propiedad GSC
          </label>
          <input
            type="text"
            value={manual}
            onChange={e => setManual(e.target.value)}
            placeholder="sc-domain:ejemplo.com"
            className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-muted px-3 py-2 text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <p className="mt-1 text-xs text-slate-400">
            Formatos válidos: <code>sc-domain:ejemplo.com</code> o <code>https://ejemplo.com/</code>
          </p>
          {properties.length > 0 && (
            <button
              onClick={() => setUseManual(false)}
              className="mt-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
            >
              ← Ver lista de propiedades
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? 'Guardando…' : 'Guardar y finalizar →'}
      </button>
    </div>
  )
}

// ── Pantalla final ───────────────────────────────────────────

function StepDone({ siteId }: { siteId: string }) {
  const router = useRouter()

  useEffect(() => {
    const t = setTimeout(() => router.push(`/dashboard/${siteId}`), 2500)
    return () => clearTimeout(t)
  }, [siteId, router])

  return (
    <div className="text-center py-8">
      <div className="text-5xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
        ¡Todo listo!
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Tu sitio está configurado y GSC conectado. Redirigiendo al dashboard…
      </p>
      <Link
        href={`/dashboard/${siteId}`}
        className="inline-flex items-center rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Ir al dashboard ahora →
      </Link>
    </div>
  )
}

// ── Componente interno que usa useSearchParams ───────────────

function NewSiteContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const [step, setStep]     = useState<'create' | 'connect' | 'select' | 'done'>('create')
  const [site, setSite]     = useState<CreatedSite | null>(null)
  const [urlError, setUrlError] = useState('')

  // Detectar retorno del callback OAuth
  useEffect(() => {
    const urlStep  = searchParams.get('step')
    const siteId   = searchParams.get('siteId')
    const gsc      = searchParams.get('gsc')
    const err      = searchParams.get('error')

    if (err) {
      setUrlError(decodeURIComponent(err))
    }

    if (gsc === 'connected' && siteId && urlStep === 'select-property') {
      setSite(prev => prev ?? { id: parseInt(siteId), tracking_id: '', domain: '' })
      setStep('select')
      // Limpiar URL
      window.history.replaceState({}, '', '/dashboard/new?step=select-property&siteId=' + siteId)
      return
    }

    if (gsc === 'connected' && siteId) {
      setSite(prev => prev ?? { id: parseInt(siteId), tracking_id: '', domain: '' })
      setStep('done')
    }
  }, [searchParams])

  const currentSiteId = site?.id ? String(site.id) : searchParams.get('siteId') ?? ''

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Breadcrumb de pasos */}
      <div className="flex items-center gap-2 mb-8 text-xs text-slate-400">
        {['create', 'connect', 'select', 'done'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span>→</span>}
            <span className={step === s ? 'text-slate-900 dark:text-white font-medium' : ''}>
              {['Dominio', 'Script + GSC', 'Propiedad', 'Listo'][i]}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        {urlError && (
          <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            <strong>Error:</strong> {urlError}
            {urlError.includes('revoke_access') && (
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="ml-2 underline"
              >
                Revocar acceso en Google →
              </a>
            )}
          </div>
        )}

        {step === 'create' && (
          <StepCreateSite
            onCreated={(s) => { setSite(s); setStep('connect') }}
          />
        )}

        {step === 'connect' && site && (
          <StepConnectGSC
            site={site}
            onSkip={() => router.push(`/dashboard/${site.id}`)}
          />
        )}

        {step === 'select' && currentSiteId && (
          <StepSelectProperty
            siteId={currentSiteId}
            onDone={() => setStep('done')}
          />
        )}

        {step === 'done' && currentSiteId && (
          <StepDone siteId={currentSiteId} />
        )}
      </div>

      {step !== 'done' && (
        <div className="mt-4 text-center">
          <Link
            href="/dashboard"
            className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            ← Volver al dashboard
          </Link>
        </div>
      )}
    </div>
  )
}

// ── Página principal con Suspense (requerido por useSearchParams) ─

export default function NewSitePage() {
  return (
    <Suspense fallback={
      <div className="p-8 max-w-2xl mx-auto">
        <div className="card animate-pulse h-64" />
      </div>
    }>
      <NewSiteContent />
    </Suspense>
  )
}
