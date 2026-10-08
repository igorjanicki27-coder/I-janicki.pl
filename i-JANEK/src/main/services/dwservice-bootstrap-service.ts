import fs from 'node:fs'
import path from 'node:path'
import type { ConsentRecord } from '@shared/contracts'
import { CURRENT_CONSENT_POLICY_VERSION } from '@shared/constants'

interface DwServiceBootstrapRecord {
  schemaVersion?: unknown
  consentPolicyVersion?: unknown
  consentAccepted?: unknown
  consentAcceptedAt?: unknown
  provisioningEnabled?: unknown
}

function getBootstrapPath() {
  return path.join(process.env.ProgramData || 'C:\\ProgramData', 'i-JANEK', 'dwservice-bootstrap.json')
}

export function mergeInstallerDwServiceConsent(current: ConsentRecord | null): ConsentRecord | null {
  if (process.platform !== 'win32') return current

  try {
    const bootstrapPath = getBootstrapPath()
    const stat = fs.lstatSync(bootstrapPath)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 16_384) return current
    const parsed = JSON.parse(fs.readFileSync(bootstrapPath, 'utf8')) as DwServiceBootstrapRecord
    if (
      parsed.schemaVersion !== 1
      || parsed.consentPolicyVersion !== CURRENT_CONSENT_POLICY_VERSION
      || parsed.consentAccepted !== true
      || parsed.provisioningEnabled !== false
      || typeof parsed.consentAcceptedAt !== 'number'
      || !Number.isSafeInteger(parsed.consentAcceptedAt)
      || parsed.consentAcceptedAt <= 0
    ) return current

    return {
      acceptedAt: current?.acceptedAt ?? parsed.consentAcceptedAt,
      policyVersion: current?.policyVersion ?? CURRENT_CONSENT_POLICY_VERSION,
      diagnosticsConsent: Boolean(current?.diagnosticsConsent),
      remoteCommandConsent: Boolean(current?.remoteCommandConsent),
      dwServiceConsent: true
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[i-JANEK] Nie udało się odczytać zgody DWService z instalatora:', error)
    }
    return current
  }
}
