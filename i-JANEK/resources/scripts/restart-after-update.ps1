param(
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$AppExe
)

$ErrorActionPreference = 'SilentlyContinue'
$statusPath = Join-Path $env:ProgramData 'i-JANEK\update-status.json'
$deadline = [DateTime]::UtcNow.AddMinutes(15)
while ([DateTime]::UtcNow -lt $deadline) {
  if (Test-Path -LiteralPath $statusPath) {
    try {
      $status = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($status.version -eq $Version -and $status.state -eq 'installed') { break }
      if ($status.state -eq 'error') { break }
    } catch {}
  }
  Start-Sleep -Seconds 2
}
if (Test-Path -LiteralPath $AppExe -PathType Leaf) {
  Start-Process -FilePath $AppExe -ArgumentList @('--updated', '--tray')
}
