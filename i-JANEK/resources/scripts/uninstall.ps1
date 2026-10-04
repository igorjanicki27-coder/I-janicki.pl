$ErrorActionPreference = 'Stop'
$taskName = 'i-JANEK Update Agent'
$root = Join-Path $env:ProgramData 'i-JANEK'

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$dwServiceStatusPath = Join-Path $root 'dwservice-status.json'
if (Test-Path -LiteralPath $dwServiceStatusPath -PathType Leaf) {
  $service = Get-Service -Name 'DWAgent' -ErrorAction SilentlyContinue
  if ($service) {
    Stop-Service -Name 'DWAgent' -Force -ErrorAction SilentlyContinue
    & sc.exe delete DWAgent | Out-Null
  }
  Get-Process -Name 'dwagent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  $dwAgentDir = Join-Path $env:ProgramFiles 'DWAgent'
  if (Test-Path -LiteralPath $dwAgentDir) { Remove-Item -LiteralPath $dwAgentDir -Recurse -Force }
  Remove-Item -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\DWAgent' -Recurse -Force -ErrorAction SilentlyContinue
  $dwAgentStartMenu = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\DWAgent'
  if (Test-Path -LiteralPath $dwAgentStartMenu) { Remove-Item -LiteralPath $dwAgentStartMenu -Recurse -Force }
}

if (Test-Path -LiteralPath $root) {
  foreach ($name in @('agent-config.json', 'update-status.json', 'update-status.tmp', 'installed-version.txt', 'google-oauth-desktop.local.json', 'dwservice-status.json', 'dwservice-status.tmp', 'dwservice-install.log')) {
    $target = Join-Path $root $name
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
  }
  foreach ($name in @('agent', 'requests', 'cache')) {
    $target = Join-Path $root $name
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  }
  if (@(Get-ChildItem -LiteralPath $root -Force).Count -eq 0) {
    Remove-Item -LiteralPath $root -Force
  }
}
