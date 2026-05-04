import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import type { RustDeskState } from '@shared/contracts'
import { localStore } from '../store'

function resolveBinaryPath() {
  const configured = process.env.RUSTDESK_BINARY_PATH || localStore.get('rustdeskBinaryPath')
  if (configured && fs.existsSync(configured)) return configured

  const packagedCandidate = path.join(process.resourcesPath, 'resources', 'rd-core.exe')
  if (fs.existsSync(packagedCandidate)) return packagedCandidate

  const devCandidate = path.join(app.getAppPath(), 'resources', 'rd-core.exe')
  if (fs.existsSync(devCandidate)) return devCandidate

  return undefined
}

export function getRustDeskState(): RustDeskState {
  const binaryPath = resolveBinaryPath()
  return {
    binaryPath,
    installed: Boolean(binaryPath)
  }
}

export async function launchRustDesk(): Promise<RustDeskState> {
  const state = getRustDeskState()
  if (!state.binaryPath) return state

  spawn(state.binaryPath, [], {
    detached: true,
    windowsHide: false,
    stdio: 'ignore'
  }).unref()

  return {
    ...state,
    lastLaunchAt: Date.now(),
    sessionHint: 'RustDesk uruchomiony lokalnie. W celu pełnego osadzenia w ramce potrzebny jest finalny wariant klienta lub web client.'
  }
}
