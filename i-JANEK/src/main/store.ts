import './env'
import Store from 'electron-store'
import type { ConsentRecord, ThemeMode, UpdateChannel } from '@shared/contracts'
import type { UpdateNoticeState } from './services/post-update-notice'

export interface LocalSchema {
  theme: ThemeMode
  consent?: ConsentRecord | null
  autoLaunch: boolean
  notificationsEnabled: boolean
  updateChannel: UpdateChannel
  registeredDeviceId?: string | null
  updateNoticeState?: UpdateNoticeState
  pendingUpdateRestartVersion?: string
}

export const localStore = new Store<LocalSchema>({
  defaults: {
    theme: 'dark',
    autoLaunch: true,
    notificationsEnabled: true,
    updateChannel: 'stable',
    registeredDeviceId: null
  }
})
