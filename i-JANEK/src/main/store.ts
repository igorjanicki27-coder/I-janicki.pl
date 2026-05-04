import Store from 'electron-store'
import type { BackupSnapshot, ConsentRecord, ThemeMode } from '@shared/contracts'

export interface LocalSchema {
  theme: ThemeMode
  consent?: ConsentRecord
  autoLaunch: boolean
  rustdeskBinaryPath?: string
  backupManifest: Record<string, BackupSnapshot & { fileStates: Record<string, number> }>
}

export const localStore = new Store<LocalSchema>({
  defaults: {
    theme: 'dark',
    autoLaunch: true,
    backupManifest: {}
  }
})
