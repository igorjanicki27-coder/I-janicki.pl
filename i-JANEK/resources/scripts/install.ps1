param(
  [Parameter(Mandatory=$true)][string]$InstallDir,
  [switch]$IsUpdate,
  [ValidateSet('true', 'false')][string]$DwServiceConsentAccepted = 'false',
  [string]$DwServiceInstallationCode = ''
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:ProgramData 'i-JANEK'
$agentDir = Join-Path $root 'agent'
$requestsDir = Join-Path $root 'requests'
$cacheDir = Join-Path $root 'cache'
$logsDir = Join-Path $root 'logs'
$logPath = Join-Path $logsDir 'install.log'
$dwServiceBootstrapPath = Join-Path $root 'dwservice-bootstrap.json'
$sourceDir = Join-Path $InstallDir 'resources\resources\scripts'
$taskName = 'i-JANEK Update Agent'

New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

function Write-InstallLog {
  param([Parameter(Mandatory=$true)][string]$Message)
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'
  Add-Content -LiteralPath $logPath -Value "[$timestamp] $Message" -Encoding UTF8
}

try {
  Write-InstallLog "Start instalacji agenta. InstallDir=$InstallDir"

  if (-not $IsUpdate) {
    if ($DwServiceConsentAccepted -ne 'true') {
      throw 'Instalacja i-JANEK wymaga zaakceptowania zgody na instalację i użycie DWService.'
    }
    if ($DwServiceInstallationCode -and $DwServiceInstallationCode -notmatch '^\d{3}-\d{3}-\d{3}$') {
      throw 'Kod instalacyjny DWService musi mieć format 123-456-789 albo pozostać pusty.'
    }
  }

  if (-not (Test-Path -LiteralPath (Join-Path $sourceDir 'update-agent.ps1'))) {
    throw 'Brakuje plików agenta aktualizacji w instalatorze.'
  }
  if (-not (Test-Path -LiteralPath (Join-Path $sourceDir 'update-signing-public.json'))) {
    throw 'Brakuje publicznego klucza aktualizacji w instalatorze.'
  }

  New-Item -ItemType Directory -Path $agentDir, $requestsDir, $cacheDir, $logsDir -Force | Out-Null
  foreach ($legacyPath in @(
    (Join-Path $root 'rustdesk-config.txt'),
    (Join-Path $root 'rustdesk-policy-run.txt'),
    (Join-Path $root 'rustdesk-policy-applied.txt'),
    (Join-Path $root 'google-oauth-desktop.local.json'),
    (Join-Path $agentDir 'rustdesk-agent.ps1')
  )) {
    if (Test-Path -LiteralPath $legacyPath) { Remove-Item -LiteralPath $legacyPath -Force }
  }
  foreach ($protectedDir in @($root, $agentDir, $cacheDir, $requestsDir, $logsDir)) {
    & icacls.exe $protectedDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Nie udało się zabezpieczyć katalogu $protectedDir." }
  }
  & icacls.exe $cacheDir /inheritance:r /remove:g '*S-1-5-32-545' /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Nie udało się zabezpieczyć katalogu pobranych aktualizacji.' }
  & icacls.exe $requestsDir /grant:r '*S-1-5-32-545:(OI)(CI)M' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Nie udało się nadać uprawnień do zgłoszeń aktualizacji.' }

  if (-not $IsUpdate) {
    $protectedCode = $null
    if ($DwServiceInstallationCode) {
      $plainBytes = [Text.Encoding]::UTF8.GetBytes($DwServiceInstallationCode)
      try {
        $encryptedBytes = [Security.Cryptography.ProtectedData]::Protect(
          $plainBytes,
          $null,
          [Security.Cryptography.DataProtectionScope]::LocalMachine
        )
        $protectedCode = [Convert]::ToBase64String($encryptedBytes)
      } finally {
        [Array]::Clear($plainBytes, 0, $plainBytes.Length)
      }
    }
    $bootstrap = @{
      schemaVersion = 1
      consentPolicyVersion = '2026-10-06'
      consentAccepted = $true
      consentAcceptedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      hasInstallationCode = [bool]$DwServiceInstallationCode
      installationCodeProtected = $protectedCode
      provisioningEnabled = $false
    } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($dwServiceBootstrapPath, $bootstrap, (New-Object Text.UTF8Encoding $false))
    & icacls.exe $dwServiceBootstrapPath /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Nie udało się zabezpieczyć ustawień startowych DWService.' }
    Write-InstallLog "Zapisano zgodę DWService. KodPodany=$([bool]$DwServiceInstallationCode) ProvisioningEnabled=False"
  }

  Write-InstallLog 'Kopiowanie plików agenta.'
  Copy-Item -LiteralPath (Join-Path $sourceDir 'update-agent.ps1') -Destination (Join-Path $agentDir 'update-agent.ps1') -Force
  Copy-Item -LiteralPath (Join-Path $sourceDir 'update-signing-public.json') -Destination (Join-Path $agentDir 'update-signing-public.json') -Force
  Copy-Item -LiteralPath (Join-Path $sourceDir 'user-session-restart.cs') -Destination (Join-Path $agentDir 'user-session-restart.cs') -Force
  # Check the native helper before advertising this protocol to the application.
  Add-Type -Path (Join-Path $agentDir 'user-session-restart.cs')
  $config = @{ installDir = (Resolve-Path -LiteralPath $InstallDir).Path; restartProtocol = 2 } | ConvertTo-Json -Compress
  Write-InstallLog 'Rejestrowanie zadania aktualizacji.'
  $powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $scriptPath = Join-Path $agentDir 'update-agent.ps1'
  $action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`""
  $startup = New-ScheduledTaskTrigger -AtStartup
  $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($startup, $repeat) -Principal $principal -Settings $settings -Force | Out-Null

  # The desktop app runs without elevation. Grant authenticated users only read/run
  # access so it can start this fixed SYSTEM task immediately after a download.
  $scheduler = New-Object -ComObject 'Schedule.Service'
  $scheduler.Connect()
  $registeredTask = $scheduler.GetFolder('\').GetTask($taskName)
  $securityDescriptor = $registeredTask.GetSecurityDescriptor(0x7)
  if ($securityDescriptor -notmatch '\(A;;(?:GRGX|0x1200a9);;;AU\)') {
    $registeredTask.SetSecurityDescriptor(($securityDescriptor + '(A;;GRGX;;;AU)'), 0)
  }

  [IO.File]::WriteAllText((Join-Path $root 'agent-config.json'), $config, (New-Object Text.UTF8Encoding $false))
  Write-InstallLog 'Instalacja agenta zakończona powodzeniem.'
} catch {
  $details = ($_ | Out-String).Trim()
  Write-InstallLog "BŁĄD: $details"
  Write-Error $details
  exit 1
}
