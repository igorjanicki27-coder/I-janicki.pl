import './env'
import Store from 'electron-store'
import type { BackupSnapshot, ConsentRecord, ThemeMode, UpdateChannel } from '@shared/contracts'

export interface LocalSchema {
  theme: ThemeMode
  consent?: ConsentRecord | null
  autoLaunch: boolean
  updateChannel: UpdateChannel
  masterAesKey: string
  masterAesKeyHistory: string[]
  registeredDeviceId?: string | null
  rustdeskIdentity?: string | null
  rustdeskPassword?: string | null
  rustdeskPasswordRotatedAt?: number | null
  rustdeskBinaryPath?: string
  rustdeskPolicyReady?: boolean
  backupManifest: Record<string, BackupSnapshot & { fileStates: Record<string, number> }>
}

export const localStore = new Store<LocalSchema>({
  defaults: {
    theme: 'dark',
    autoLaunch: true,
    updateChannel: 'stable',
    masterAesKey: process.env.I_JANEK_AES_VAULT_KEY?.trim() || '',
    masterAesKeyHistory: [],
    registeredDeviceId: null,
    rustdeskIdentity: null,
    rustdeskPassword: null,
    rustdeskPasswordRotatedAt: null,
    rustdeskPolicyReady: false,
    backupManifest: {}
  }
})
