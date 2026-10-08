import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

const installer = await fs.readFile(new URL('../build/installer.nsh', import.meta.url), 'utf8')
const installScript = await fs.readFile(new URL('../resources/scripts/install.ps1', import.meta.url), 'utf8')
const bootstrapService = await fs.readFile(new URL('../src/main/services/dwservice-bootstrap-service.ts', import.meta.url), 'utf8')

test('fresh Windows installation requires explicit DWService consent', () => {
  assert.match(installer, /Page custom dwServiceConsentPageCreate dwServiceConsentPageLeave/)
  assert.match(installer, /\$0 != \$\{BST_CHECKED\}/)
  assert.match(installer, /Zgoda na instalację i użycie DWService jest wymagana/)
  assert.match(installScript, /if \(\$DwServiceConsentAccepted -ne 'true'\)/)
  assert.match(installer, /\$\{Silent\}[\s\S]*\$DWServiceExistingInstall != "true"[\s\S]*SetErrorLevel 2/)
})

test('DWService code is required, segmented and must match the configured code', () => {
  assert.match(installer, /Kod instalacyjny DWService \(wymagany\)/)
  assert.match(installer, /!define DW_SERVICE_REQUIRED_INSTALLATION_CODE "000-000-000"/)
  assert.equal((installer.match(/\$\{NSD_CreateNumber\}/g) || []).length, 3)
  assert.equal((installer.match(/\$\{EM_LIMITTEXT\} 3/g) || []).length, 3)
  assert.match(installer, /dwServiceCodePart1Changed[\s\S]*\$\{WM_NEXTDLGCTL\} \$DWServiceCodePart2Input 1/)
  assert.match(installer, /dwServiceCodePart2Changed[\s\S]*\$\{WM_NEXTDLGCTL\} \$DWServiceCodePart3Input 1/)
  assert.match(installer, /StrCpy \$DWServiceInstallationCode "\$1-\$2-\$3"/)
  assert.match(installer, /StrCmp \$DWServiceInstallationCode "\$\{DW_SERVICE_REQUIRED_INSTALLATION_CODE\}" code_valid code_invalid/)
  assert.match(installScript, /\$DwServiceInstallationCode -cne '000-000-000'/)
  assert.match(installScript, /ProtectedData\]::Protect/)
  assert.match(installScript, /icacls\.exe \$dwServiceBootstrapPath \/inheritance:r/)
  assert.match(installScript, /consentPolicyVersion = '2026-10-06'/)
  assert.match(installScript, /provisioningEnabled = \$false/)
})

test('application reuses the installer consent without exposing the protected code', () => {
  assert.match(bootstrapService, /consentPolicyVersion !== CURRENT_CONSENT_POLICY_VERSION/)
  assert.match(bootstrapService, /dwServiceConsent: true/)
  assert.doesNotMatch(bootstrapService, /installationCodeProtected/)
})

test('automatic updates skip the new-consent bootstrap without overwriting it', () => {
  assert.match(installer, /ReadRegStr \$0 HKLM "Software\\\$\{APP_GUID\}" InstallLocation/)
  assert.match(installer, /\$\{if\} \$DWServiceExistingInstall == "true"[\s\S]*-IsUpdate/)
  assert.match(installScript, /if \(-not \$IsUpdate\)/)
})
