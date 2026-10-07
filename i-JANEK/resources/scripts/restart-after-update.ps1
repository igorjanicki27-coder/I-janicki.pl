param(
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$AppExe,
  [Parameter(Mandatory=$true)][string]$LogPath,
  [Parameter(Mandatory=$true)][string]$AttemptId,
  [Parameter(Mandatory=$true)][string]$HandshakePath,
  [switch]$StartHidden
)

$ErrorActionPreference = 'Stop'
$statusPath = Join-Path $env:ProgramData 'i-JANEK\update-status.json'
$logDir = Split-Path -Parent $LogPath

function Write-RestartLog([string]$Message) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  Add-Content -LiteralPath $LogPath -Value "[$([DateTime]::UtcNow.ToString('o'))] $Message" -Encoding UTF8
}

try {
  [IO.File]::WriteAllText($HandshakePath, $AttemptId, (New-Object Text.UTF8Encoding $false))
  Write-RestartLog "Uruchomiono obserwatora aktualizacji $Version. Próba=$AttemptId AppExe=$AppExe StartHidden=$StartHidden"
  $deadline = [DateTime]::UtcNow.AddMinutes(15)
  $finalState = 'timeout'
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-Path -LiteralPath $statusPath) {
      $status = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($status.version -eq $Version -and $status.state -eq 'installed') {
        $finalState = 'installed'
        break
      }
      if ($status.state -eq 'error') {
        $finalState = 'error'
        break
      }
    }
    Start-Sleep -Seconds 2
  }
  Write-RestartLog "Zakończono oczekiwanie na agenta. Stan=$finalState"

  if ($finalState -ne 'installed') {
    throw "Agent aktualizacji zakończył oczekiwanie ze stanem: $finalState"
  }

  if (-not (Test-Path -LiteralPath $AppExe -PathType Leaf)) {
    throw "Nie znaleziono aplikacji po aktualizacji: $AppExe"
  }

  $arguments = @('--updated')
  if ($StartHidden) { $arguments += '--tray' }
  $process = Start-Process -FilePath $AppExe -ArgumentList $arguments -PassThru
  Write-RestartLog "Uruchomiono i-JANEK. PID=$($process.Id) Argumenty=$($arguments -join ' ')"
} catch {
  try { Write-RestartLog "BŁĄD: $($_.Exception.Message)" } catch {}
  exit 1
}
