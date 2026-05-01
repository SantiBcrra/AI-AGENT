// ============================================================
// GeoIP — MaxMind GeoLite2 (archivo local, sin API externa)
// El archivo .mmdb se actualiza mensualmente con un cron job
// ============================================================

import * as maxmind from 'maxmind'
import path from 'path'
import type { GeoResult } from '@/types/collect'

// Ruta al archivo de base de datos GeoLite2
// Descargar gratis en: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
const DB_PATH = path.join(process.cwd(), 'data', 'GeoLite2-City.mmdb')

declare global {
  // eslint-disable-next-line no-var
  var _geoipReader: maxmind.Reader<maxmind.CityResponse> | undefined
}

async function getReader(): Promise<maxmind.Reader<maxmind.CityResponse> | null> {
  if (global._geoipReader) return global._geoipReader

  try {
    const reader = await maxmind.open<maxmind.CityResponse>(DB_PATH)
    global._geoipReader = reader
    return reader
  } catch {
    // El archivo no existe todavía — retorna null y se omite el geo
    console.warn('[GeoIP] GeoLite2-City.mmdb not found at:', DB_PATH)
    console.warn('[GeoIP] Download from https://dev.maxmind.com/geoip/geolite2-free-geolocation-data')
    return null
  }
}

export async function lookupIp(ip: string): Promise<GeoResult> {
  const empty: GeoResult = {
    countryCode: null,
    countryName: null,
    region: null,
    city: null,
    latitude: null,
    longitude: null,
    isVpn: false,
    isProxy: false,
    isDatacenter: false,
  }

  if (!ip || ip === '127.0.0.1' || ip === '::1') return empty

  const reader = await getReader()
  if (!reader) return empty

  try {
    const result = reader.get(ip)
    if (!result) return empty

    return {
      countryCode:   result.country?.iso_code ?? null,
      countryName:   result.country?.names?.en ?? null,
      region:        result.subdivisions?.[0]?.names?.en ?? null,
      city:          result.city?.names?.en ?? null,
      latitude:      result.location?.latitude ?? null,
      longitude:     result.location?.longitude ?? null,
      isVpn:         false,   // GeoLite2 no incluye datos de VPN
      isProxy:       false,   // GeoLite2 no incluye datos de proxy
      isDatacenter:  false,
    }
  } catch {
    return empty
  }
}

// Extraer la IP real del request, considerando proxies y Cloudflare
export function extractIp(headers: Headers): string {
  // Orden de prioridad: headers de proxy/CDN → IP real
  return (
    headers.get('cf-connecting-ip') ??          // Cloudflare
    headers.get('x-real-ip') ??                 // Nginx proxy
    headers.get('x-forwarded-for')?.split(',')[0].trim() ?? // proxy genérico
    headers.get('x-client-ip') ??
    '0.0.0.0'
  )
}
