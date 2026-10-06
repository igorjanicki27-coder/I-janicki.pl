import type { JanekApi } from '@shared/ipc'

const CONSENT_KEY = 'i-janek-browser-consent'
const DEVICE_ID_KEY = 'i-janek-browser-device-id'

function desktopOnly(feature: string): never {
  throw new Error(`${feature} wymaga aplikacji i-JANEK zainstalowanej na Windows lub macOS.`)
}

function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function createBrowserApi(): JanekApi {
  return {
    dwServicePoc: {
      open: async () => desktopOnly('Panel DWService'),
      close: async () => undefined,
      setBounds: async () => undefined,
      closePopup: async () => undefined,
      goBack: async () => undefined,
      onStatus: () => () => undefined
    },
    dwServiceAgent: {
      getState: async () => desktopOnly('Agent DWService'),
      applyCode: async () => desktopOnly('Agent DWService')
    },
    system: {
      getContext: async () => ({
        deviceId: localStorage.getItem(DEVICE_ID_KEY) || `WEB-${crypto.randomUUID()}`,
        machineId: 'browser',
        hostname: window.location.hostname || 'browser',
        platform: 'web',
        arch: 'web',
        appVersion: import.meta.env.VITE_APP_VERSION || 'web',
        isPackaged: false
      }),
      setAutoLaunch: async () => desktopOnly('Autostart'),
      setNotificationsEnabled: async () => undefined,
      notify: async (title, body) => {
        if (!('Notification' in window)) return
        if (Notification.permission === 'default') await Notification.requestPermission()
        if (Notification.permission === 'granted') new Notification(title, { body })
      },
      getConsent: async () => readJson(CONSENT_KEY),
      setConsent: async (consent) => {
        if (consent) localStorage.setItem(CONSENT_KEY, JSON.stringify(consent))
        else localStorage.removeItem(CONSENT_KEY)
      },
      checkForUpdates: async () => ({ status: 'web', message: 'Panel webowy aktualizuje się automatycznie.' }),
      setUpdateChannel: async () => undefined,
      createDiagnosticBundle: async (summary) => {
        const payload = JSON.stringify({
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          application: { name: 'i-JANEK Web', version: import.meta.env.VITE_APP_VERSION || 'web' },
          summary
        }, null, 2)
        const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url
        link.download = `i-janek-diagnostyka-${new Date().toISOString().slice(0, 10)}.json`
        link.click()
        URL.revokeObjectURL(url)
        return { saved: true, path: link.download }
      },
      logEvent: async () => undefined,
      setRegisteredDeviceId: async (deviceId) => {
        if (deviceId) localStorage.setItem(DEVICE_ID_KEY, deviceId)
        else localStorage.removeItem(DEVICE_ID_KEY)
      },
      promptRestart: async () => desktopOnly('Restart komputera'),
    },
    telemetry: {
      collect: async () => desktopOnly('Telemetria systemowa'),
      inventory: async () => desktopOnly('Inwentaryzacja systemowa')
    },
    terminal: {
      execute: async () => desktopOnly('Terminal lokalny')
    }
  }
}

export function installRuntimeBridge() {
  if (!window.janek) window.janek = createBrowserApi()
}

export function isDesktopRuntime() {
  return navigator.userAgent.toLowerCase().includes('electron')
}
