$ErrorActionPreference = "Stop"
$appName = "i-JANEK"
$userDataDirs = @(
  (Join-Path $env:APPDATA "i-janek"),
  (Join-Path $env:APPDATA "i-JANEK")
)
$oauthSource = Join-Path $PSScriptRoot "..\google-oauth-desktop.local.json"

foreach ($userDataDir in $userDataDirs) {
  $null = New-Item -ItemType Directory -Path $userDataDir -Force
  Set-Content -Path (Join-Path $userDataDir "post-install-update.pending") -Value (Get-Date).ToUniversalTime().ToString("o") -Encoding ASCII -Force
  if (Test-Path $oauthSource) {
    Copy-Item -Path $oauthSource -Destination (Join-Path $userDataDir "google-oauth-desktop.local.json") -Force
  }
}

$runKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
$exePath = Join-Path $PSScriptRoot "..\\..\\i-JANEK.exe"
if (Test-Path $exePath) {
  New-Item -Path $runKey -Force | Out-Null
  Set-ItemProperty -Path $runKey -Name $appName -Value ('"' + (Resolve-Path $exePath).Path + '" --tray')
}

function Resolve-RustDeskBinary {
  $candidates = @(
    (Join-Path $PSScriptRoot "..\rd-core.exe"),
    (Join-Path $PSScriptRoot "..\..\RustDesk\rustdesk.exe"),
    (Join-Path $env:ProgramFiles "RustDesk\rustdesk.exe")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }

  return $null
}

function Get-RustDeskPassword {
  param(
    [int]$Length = 20
  )

  $alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  $buffer = New-Object byte[] ($Length * 2)
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  $result = ""

  foreach ($b in $buffer) {
    if ($result.Length -ge $Length) {
      break
    }
    $result += $alphabet[$b % $alphabet.Length]
  }

  if ($result.Length -lt $Length) {
    $result += Get-RustDeskPassword -Length ($Length - $result.Length)
  }

  return $result
}

function Set-RustDeskLock {
  param(
    [string[]]$Targets
  )

  foreach ($target in $Targets) {
    if (Test-Path $target) {
      attrib +R $target | Out-Null
      icacls $target /inheritance:r | Out-Null
      icacls $target /grant:r *S-1-5-18:(F) *S-1-5-32-544:(F) *S-1-5-32-545:(R) | Out-Null
    }
  }
}

$rustDeskBinary = Resolve-RustDeskBinary
$rustDeskPassword = Get-RustDeskPassword -Length 20
$rustDeskConfigString = [Environment]::GetEnvironmentVariable("RUSTDESK_CONFIG_STRING", "Machine")
if (-not $rustDeskConfigString) {
  $rustDeskConfigString = [Environment]::GetEnvironmentVariable("RUSTDESK_CONFIG_STRING", "User")
}
if (-not $rustDeskConfigString) {
  $configFiles = @(
    (Join-Path $PSScriptRoot "..\rustdesk-config.local.txt"),
    (Join-Path $PSScriptRoot "..\rustdesk-config.txt")
  )
  foreach ($configFile in $configFiles) {
    if (Test-Path $configFile) {
      $fromFile = (Get-Content -Path $configFile -Raw).Trim()
      if ($fromFile -and -not $fromFile.StartsWith("#")) {
        $rustDeskConfigString = $fromFile
        break
      }
    }
  }
}
$lockConfig = [Environment]::GetEnvironmentVariable("RUSTDESK_LOCK_CONFIG", "Machine")
if (-not $lockConfig) {
  $lockConfig = [Environment]::GetEnvironmentVariable("RUSTDESK_LOCK_CONFIG", "User")
}
if (-not $lockConfig) {
  $lockConfig = "1"
}

if ($rustDeskBinary) {
  if ($rustDeskConfigString) {
    Start-Process -FilePath $rustDeskBinary -ArgumentList @("--config", $rustDeskConfigString) -WindowStyle Hidden -Wait
  }

  if ($rustDeskPassword) {
    Start-Process -FilePath $rustDeskBinary -ArgumentList @("--password", $rustDeskPassword) -WindowStyle Hidden -Wait
  }

  if ($lockConfig -ne "0") {
    $configTargets = @(
      (Join-Path $env:APPDATA "RustDesk\config\RustDesk.toml"),
      (Join-Path $env:APPDATA "RustDesk\config\RustDesk2.toml"),
      (Join-Path $env:APPDATA "RustDesk\RustDesk.toml"),
      (Join-Path $env:APPDATA "RustDesk\RustDesk2.toml"),
      (Join-Path $env:WINDIR "ServiceProfiles\LocalService\AppData\Roaming\RustDesk\config\RustDesk.toml"),
      (Join-Path $env:WINDIR "ServiceProfiles\LocalService\AppData\Roaming\RustDesk\config\RustDesk2.toml"),
      (Join-Path $env:WINDIR "ServiceProfiles\LocalService\AppData\Roaming\RustDesk\RustDesk.toml"),
      (Join-Path $env:WINDIR "ServiceProfiles\LocalService\AppData\Roaming\RustDesk\RustDesk2.toml")
    )
    Set-RustDeskLock -Targets $configTargets
  }
}
