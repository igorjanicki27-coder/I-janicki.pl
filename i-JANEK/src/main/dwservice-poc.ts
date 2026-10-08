import { BrowserWindow, WebContentsView, session } from 'electron'
import type { Rectangle, WebContents, WebPreferences } from 'electron'
import type { DwServicePocStatus } from '@shared/ipc'

const DWSERVICE_URL = 'https://www.dwservice.net/'
const DWSERVICE_PARTITION = 'persist:dwservice'

let host: BrowserWindow | null = null
let views: WebContentsView[] = []
let bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }

function publish(status: DwServicePocStatus) {
  if (host && !host.isDestroyed() && !host.webContents.isDestroyed()) {
    host.webContents.send('dwservice:poc-status', status)
  }
}

function isDwServiceUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'dwservice.net' || url.hostname.endsWith('.dwservice.net'))
  } catch {
    return false
  }
}

function activeView() {
  return views.at(-1) ?? null
}

function secureWebPreferences(): WebPreferences {
  return {
    preload: undefined,
    partition: DWSERVICE_PARTITION,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    webviewTag: false,
    javascript: true,
    allowRunningInsecureContent: false
  }
}

function removeView(view: WebContentsView) {
  const index = views.indexOf(view)
  if (index < 0) return
  views.splice(index, 1)
  if (host && !host.isDestroyed()) host.contentView.removeChildView(view)
  if (!view.webContents.isDestroyed()) view.webContents.close()
  publish({ state: views.length ? 'ready' : 'closed', url: activeView()?.webContents.getURL(), popupCount: Math.max(0, views.length - 1) })
}

function addView(isPopup: boolean, adoptedWebContents?: WebContents) {
  if (!host || host.isDestroyed()) throw new Error('Okno i-JANEK nie jest dostępne.')
  const view = adoptedWebContents
    ? new WebContentsView({ webContents: adoptedWebContents })
    : new WebContentsView({ webPreferences: secureWebPreferences() })
  view.setBounds(bounds)
  host.contentView.addChildView(view)
  views.push(view)
  const contents = view.webContents

  contents.on('did-start-loading', () => publish({ state: 'loading', url: contents.getURL(), popupCount: Math.max(0, views.length - 1) }))
  contents.on('did-finish-load', () => publish({ state: isPopup ? 'popup' : 'ready', url: contents.getURL(), popupCount: Math.max(0, views.length - 1) }))
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) publish({ state: 'error', url, error: `${description} (${code})`, popupCount: Math.max(0, views.length - 1) })
  })
  contents.on('will-navigate', (event, url) => {
    if (url !== 'about:blank' && !isDwServiceUrl(url)) {
      event.preventDefault()
      publish({ state: 'error', url, error: 'Zablokowano przejście poza domenę DWService.', popupCount: Math.max(0, views.length - 1) })
    }
  })
  contents.on('will-redirect', (event, url) => {
    if (url !== 'about:blank' && !isDwServiceUrl(url)) {
      event.preventDefault()
      publish({ state: 'error', url, error: 'Zablokowano przekierowanie poza domenę DWService.', popupCount: Math.max(0, views.length - 1) })
    }
  })
  contents.on('destroyed', () => {
    const index = views.indexOf(view)
    if (index >= 0) views.splice(index, 1)
  })
  contents.setWindowOpenHandler(({ url }) => {
    if (url !== 'about:blank' && !isDwServiceUrl(url)) {
      publish({ state: 'error', url, error: 'Zablokowano otwarcie karty poza domeną DWService.', popupCount: Math.max(0, views.length - 1) })
      return { action: 'deny' }
    }
    publish({ state: 'popup', url, popupCount: views.length })
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: secureWebPreferences()
      },
      createWindow: () => addView(true).webContents
    }
  })
  return view
}

export async function openDwServicePoc(window: BrowserWindow) {
  if (host && host !== window) await closeDwServicePoc()
  host = window
  if (views.length) return
  const dwServiceSession = session.fromPartition(DWSERVICE_PARTITION)
  dwServiceSession.setPermissionRequestHandler((requestingContents, permission, callback) => {
    const ours = views.some((view) => view.webContents === requestingContents)
    callback(ours && isDwServiceUrl(requestingContents.getURL()) && (permission === 'clipboard-read' || permission === 'clipboard-sanitized-write'))
  })
  dwServiceSession.setPermissionCheckHandler((requestingContents, permission, requestingOrigin) => {
    const ours = views.some((view) => view.webContents === requestingContents)
    return ours && isDwServiceUrl(requestingOrigin) && (permission === 'clipboard-read' || permission === 'clipboard-sanitized-write')
  })
  const view = addView(false)
  publish({ state: 'loading', url: DWSERVICE_URL, popupCount: 0 })
  void view.webContents.loadURL(DWSERVICE_URL).catch((error: unknown) => {
    publish({ state: 'error', url: DWSERVICE_URL, error: error instanceof Error ? error.message : String(error), popupCount: 0 })
  })
}

export function setDwServicePocBounds(rect: Rectangle) {
  if (!host || host.isDestroyed() || !views.length) return
  const size = host.getContentSize()
  const x = Math.max(0, Math.min(Math.round(rect.x), size[0]))
  const y = Math.max(0, Math.min(Math.round(rect.y), size[1]))
  bounds = {
    x,
    y,
    width: Math.max(0, Math.min(Math.round(rect.width), size[0] - x)),
    height: Math.max(0, Math.min(Math.round(rect.height), size[1] - y))
  }
  for (const view of views) view.setBounds(bounds)
}

export function closeDwServicePocPopup() {
  if (views.length > 1) removeView(views[views.length - 1])
}

export function goBackDwServicePoc() {
  const contents: WebContents | undefined = activeView()?.webContents
  if (contents?.navigationHistory.canGoBack()) contents.navigationHistory.goBack()
}

export async function closeDwServicePoc() {
  for (const view of [...views].reverse()) removeView(view)
  host = null
  bounds = { x: 0, y: 0, width: 0, height: 0 }
  await session.fromPartition(DWSERVICE_PARTITION).flushStorageData()
}
