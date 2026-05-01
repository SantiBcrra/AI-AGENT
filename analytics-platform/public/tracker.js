/**
 * Analytics Tracker — Production Script
 * Colocar en el <head> de cada sitio cliente:
 *
 *   <script src="https://stats.tudominio.com/tracker.js"
 *           data-site="trk_XXXXXXXX" async></script>
 *
 * El data-site es el tracking_id del sitio en la BD.
 *
 * Eventos automáticos:
 *   pageview      — carga de página (incluye schema_types detectados)
 *   scroll        — al superar 25/50/75/100% de profundidad
 *   engagement    — tiempo en página al ocultar/cerrar tab
 *   click         — clic en botones y links internos
 *   outbound      — clic en link externo
 *   download      — descarga de archivo (pdf, zip, docx, etc.)
 *   video         — play / pause / complete en <video>
 *
 * API pública:
 *   window.track('nombre_evento', { key: 'value' })
 */
;(function () {
  'use strict'

  // ── Configuración ────────────────────────────────────────
  var script   = document.currentScript
  var SITE_ID  = script ? script.getAttribute('data-site') : null
  var ENDPOINT = (script ? script.src.replace('/tracker.js', '') : '') + '/api/collect'

  if (!SITE_ID) return

  // ── Token de sesión ─────────────────────────────────────
  // No cookies — sessionStorage (se borra al cerrar tab, GDPR-compliant)
  var SESSION_KEY = '_at_sess'
  var sessToken   = sessionStorage.getItem(SESSION_KEY)
  if (!sessToken) {
    sessToken = Math.random().toString(36).slice(2) +
                Math.random().toString(36).slice(2) +
                Date.now().toString(36)
    sessionStorage.setItem(SESSION_KEY, sessToken)
  }

  // ── Señales anti-bot ─────────────────────────────────────
  var signals = {
    bot_score:    0,
    interacted:   false,
    mouse_points: 0,
    webdriver:    !!navigator.webdriver,
    no_plugins:   navigator.plugins.length === 0,
    no_languages: navigator.languages.length === 0,
    instant_load: false,
    honeypot:     false,
    canvas_fp:    '',
    load_ms:      0,
  }

  // Canvas fingerprint (bots headless generan resultado distinto)
  try {
    var c = document.createElement('canvas')
    var ctx = c.getContext('2d')
    if (ctx) {
      ctx.textBaseline = 'top'
      ctx.font = '14px Arial'
      ctx.fillText('t', 2, 2)
      signals.canvas_fp = c.toDataURL().slice(-32)
    }
  } catch (_) {}

  // Score inicial desde señales estáticas
  if (signals.webdriver)                          signals.bot_score += 40
  if (signals.no_plugins && signals.no_languages) signals.bot_score += 20

  // Interacción real del usuario
  function onInteract() { signals.interacted = true }
  document.addEventListener('mousemove', function () {
    signals.mouse_points++
    if (signals.mouse_points === 1) onInteract()
  }, { passive: true })
  document.addEventListener('touchstart', onInteract, { passive: true })
  document.addEventListener('keydown',    onInteract, { passive: true })
  document.addEventListener('scroll',     onInteract, { passive: true, once: true })

  // Honeypot: link invisible — solo bots hacen clic
  var hp = document.getElementById('__hp')
  if (hp) {
    hp.addEventListener('click', function (e) {
      e.preventDefault()
      signals.honeypot   = true
      signals.bot_score += 60
    })
  }

  // ── Detección de Structured Data (JSON-LD) ───────────────
  // Detecta esquemas presentes en la página al momento del pageview
  // Útil para recomendar schemas faltantes (Product, FAQ, Review, etc.)
  function detectSchemas() {
    var types = []
    try {
      var scripts = document.querySelectorAll('script[type="application/ld+json"]')
      for (var i = 0; i < scripts.length; i++) {
        try {
          var data  = JSON.parse(scripts[i].textContent || '')
          var items = Array.isArray(data) ? data : [data]
          for (var j = 0; j < items.length; j++) {
            var t = items[j] && items[j]['@type']
            if (!t) continue
            var arr = Array.isArray(t) ? t : [t]
            for (var k = 0; k < arr.length; k++) {
              if (arr[k] && types.indexOf(arr[k]) === -1) types.push(arr[k])
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
    return types
  }

  // ── Envío de evento ─────────────────────────────────────
  function send(eventName, extra) {
    var params = new URLSearchParams(location.search)
    var payload = {
      sid:           SITE_ID,
      session_token: sessToken,
      event:         eventName,
      url:           location.href,
      path:          location.pathname,
      query_string:  location.search || undefined,
      title:         document.title,
      ref:           document.referrer || undefined,
      ua:            navigator.userAgent,
      lang:          navigator.language,
      screen:        screen.width + 'x' + screen.height,
      viewport:      window.innerWidth + 'x' + window.innerHeight,
      tz_offset:     new Date().getTimezoneOffset(),
      utm_source:    params.get('utm_source') || undefined,
      utm_medium:    params.get('utm_medium') || undefined,
      utm_campaign:  params.get('utm_campaign') || undefined,
      utm_content:   params.get('utm_content') || undefined,
      utm_term:      params.get('utm_term') || undefined,
      bot_signals:   signals,
      ts:            Date.now(),
    }

    if (extra) {
      for (var k in extra) payload[k] = extra[k]
    }

    var body = JSON.stringify(payload)

    // sendBeacon: no bloquea, funciona en beforeunload/visibilitychange
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, body)
    } else {
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true })
        .catch(function () {})
    }
  }

  // ── Pageview inicial ─────────────────────────────────────
  var pageStart = Date.now()
  var pageSchemas = []

  function sendPageview() {
    signals.load_ms      = Math.round(performance.now())
    signals.instant_load = signals.load_ms < 100
    if (signals.instant_load) signals.bot_score += 10

    pageSchemas = detectSchemas()
    var props = pageSchemas.length ? { properties: { schema_types: pageSchemas } } : undefined
    send('pageview', props)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendPageview)
  } else {
    sendPageview()
  }

  // ── Scroll depth ─────────────────────────────────────────
  var maxScroll   = 0
  var scrollTimer = null
  window.addEventListener('scroll', function () {
    if (scrollTimer) return
    scrollTimer = setTimeout(function () {
      scrollTimer = null
      var docH = document.documentElement.scrollHeight - window.innerHeight
      if (docH <= 0) return
      var pct  = Math.min(100, Math.round((window.scrollY / docH) * 100))
      var mark = Math.floor(pct / 25) * 25
      if (mark > maxScroll && mark > 0) {
        maxScroll = mark
        send('scroll', { scroll_depth: mark })
      }
    }, 500)
  }, { passive: true })

  // ── Engagement: tiempo en página al ocultar/cerrar tab ──
  window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      send('engagement', {
        duration_ms:  Date.now() - pageStart,
        scroll_depth: maxScroll,
      })
    }
  })

  // ── Click tracking ───────────────────────────────────────
  // Delegado: un solo listener en document para todos los clics.
  // Solo captura elementos interactivos (a, button, [role=button], inputs).
  // Cooldown de 1s por elemento para evitar doble-envío.
  // Detecta automáticamente: links externos, descargas, clics internos.
  var clickCooldown = {}

  document.addEventListener('click', function (e) {
    // Subir en el DOM hasta encontrar un elemento clickable
    var el = e.target
    var clickable = el
    if (typeof el.closest === 'function') {
      clickable = el.closest(
        'a, button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"]'
      ) || el
    }

    var tag  = clickable.tagName ? clickable.tagName.toLowerCase() : 'unknown'
    var text = ((clickable.innerText || clickable.value || clickable.getAttribute('aria-label') || '').trim()).slice(0, 100)
    var elId = clickable.id || undefined
    var href = clickable.href || (clickable.getAttribute && clickable.getAttribute('href')) || undefined

    // Cooldown: máximo 1 evento por elemento por segundo
    var coolKey = tag + '|' + (elId || text.slice(0, 20) || href || '')
    var now = Date.now()
    if (clickCooldown[coolKey] && now - clickCooldown[coolKey] < 1000) return
    clickCooldown[coolKey] = now

    // Detectar link saliente o descarga
    if (href && tag === 'a') {
      try {
        var target = new URL(href, location.href)
        if (target.origin !== location.origin) {
          // Comprobar si es descarga por extensión
          var isDownload = clickable.hasAttribute('download') ||
            /\.(pdf|zip|xlsx?|docx?|csv|pptx?|rar|tar\.gz|gz|exe|dmg|pkg|apk)$/i
              .test(target.pathname)
          if (isDownload) {
            send('download', {
              properties: {
                file: target.pathname.split('/').pop().slice(0, 100),
                href: href.slice(0, 500),
                text: text,
              },
            })
          } else {
            send('outbound', {
              properties: {
                href: href.slice(0, 500),
                text: text,
                domain: target.hostname,
              },
            })
          }
          return
        }
      } catch (_) {}

      // Link interno con descarga por atributo o extensión de ruta
      if (clickable.hasAttribute('download') ||
          /\.(pdf|zip|xlsx?|docx?|csv|pptx?|rar|tar\.gz|gz|exe|dmg|pkg|apk)$/i
            .test(href.split('?')[0])) {
        send('download', {
          properties: {
            file: href.split('/').pop().split('?')[0].slice(0, 100),
            text: text,
          },
        })
        return
      }
    }

    // Clic interno
    send('click', {
      properties: {
        tag:  tag,
        id:   elId,
        text: text,
      },
    })
  }, { passive: true })

  // ── Video tracking ───────────────────────────────────────
  // Usa fase de captura (true) para recibir eventos de todos los <video>
  // sin necesidad de instrumentar cada elemento por separado.
  function getVideoSrc(video) {
    var src = video.currentSrc || video.src || ''
    // Solo el nombre de archivo, no la URL completa (privacidad)
    return src.split('/').pop().split('?')[0].slice(0, 100)
  }

  document.addEventListener('play', function (e) {
    var v = e.target
    if (!v || v.tagName !== 'VIDEO') return
    send('video', {
      properties: {
        action:      'play',
        position_sec: Math.round(v.currentTime || 0),
        src:          getVideoSrc(v),
      },
    })
  }, true)

  document.addEventListener('pause', function (e) {
    var v = e.target
    if (!v || v.tagName !== 'VIDEO' || v.ended) return
    send('video', {
      properties: {
        action:      'pause',
        position_sec: Math.round(v.currentTime || 0),
        src:          getVideoSrc(v),
      },
    })
  }, true)

  document.addEventListener('ended', function (e) {
    var v = e.target
    if (!v || v.tagName !== 'VIDEO') return
    send('video', {
      properties: {
        action:       'complete',
        duration_sec: Math.round(v.duration || 0),
        src:          getVideoSrc(v),
      },
    })
  }, true)

  // ── API pública para eventos custom ─────────────────────
  // Uso:  window.track('compra', { producto: 'Plan Pro', valor: 99 })
  //       window.track('form_submit', { formulario: 'contacto' })
  //       window.track('conversion', { value: 49.99, currency: 'USD' })
  window.track = function (eventName, properties) {
    send(eventName, { properties: properties || {} })
  }

  // ── SPA: detectar navegación sin recarga ─────────────────
  // Compatible con React Router, Next.js, Vue Router, etc.
  var lastPath = location.pathname
  var origPush = history.pushState.bind(history)
  var origRepl = history.replaceState.bind(history)

  function onNav() {
    if (location.pathname !== lastPath) {
      lastPath  = location.pathname
      pageStart = Date.now()
      maxScroll = 0
      // Pequeño delay para que el DOM tenga el nuevo título
      setTimeout(function () {
        pageSchemas = detectSchemas()
        var props = pageSchemas.length ? { properties: { schema_types: pageSchemas } } : undefined
        send('pageview', props)
      }, 0)
    }
  }

  history.pushState    = function () { origPush.apply(this, arguments); onNav() }
  history.replaceState = function () { origRepl.apply(this, arguments); onNav() }
  window.addEventListener('popstate', onNav)

})()
