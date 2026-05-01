// ============================================================
// UA Parser — detecta browser, OS y tipo de dispositivo
// ============================================================

import UAParser from 'ua-parser-js'
import type { DeviceResult } from '@/types/collect'

export function parseUserAgent(ua: string): DeviceResult {
  if (!ua) {
    return {
      browser: null, browserVersion: null, engine: null,
      os: null, osVersion: null,
      deviceType: 'unknown', deviceBrand: null,
    }
  }

  const parser = new UAParser(ua)
  const result = parser.getResult()

  // Tipo de dispositivo
  let deviceType: DeviceResult['deviceType'] = 'desktop'
  const rawType = result.device.type

  if (rawType === 'mobile')  deviceType = 'mobile'
  else if (rawType === 'tablet') deviceType = 'tablet'
  else if (
    rawType === 'wearable' ||
    rawType === 'embedded' ||
    rawType === 'console' ||
    rawType === 'smarttv' ||
    rawType === 'xr'
  ) deviceType = 'unknown'

  // Brave no se identifica por UA (usa mismo UA que Chrome)
  // Se puede detectar por navigator.brave en el browser (señal JS futura)
  const browserName = result.browser.name ?? null

  return {
    browser:        browserName,
    browserVersion: result.browser.version ?? null,
    engine:         result.engine.name ?? null,
    os:             result.os.name ?? null,
    osVersion:      result.os.version ?? null,
    deviceType,
    deviceBrand:    result.device.vendor ?? null,
  }
}
