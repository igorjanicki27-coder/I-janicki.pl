import Store from 'electron-store'
import type { BackupSnapshot, ConsentRecord, ThemeMode } from '@shared/contracts'

export interface LocalSchema {
  theme: ThemeMode
  consent?: ConsentRecord | null
  autoLaunch: boolean
  masterAesKey: string
  registeredDeviceId?: string | null
  rustdeskIdentity?: string | null
  rustdeskPassword?: string | null
  rustdeskPasswordRotatedAt?: number | null
  rustdeskBinaryPath?: string
  backupManifest: Record<string, BackupSnapshot & { fileStates: Record<string, number> }>
}

export const localStore = new Store<LocalSchema>({
  defaults: {
    theme: 'dark',
    autoLaunch: true,
    masterAesKey: process.env.I_JANEK_AES_VAULT_KEY?.trim() || '',
    registeredDeviceId: null,
    rustdeskIdentity: null,
    rustdeskPassword: null,
    rustdeskPasswordRotatedAt: null,
    backupManifest: {}
  }
})
