$ErrorActionPreference = 'Stop'
$taskName = 'i-JANEK Update Agent'
$root = Join-Path $env:ProgramData 'i-JANEK'

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$rustDeskRoots = @(
  (Join-Path $env:APPDATA 'RustDesk'),
  (Join-Path $env:WINDIR 'ServiceProfiles\LocalService\AppData\Roaming\RustDesk')
)
foreach ($rustDeskRoot in $rustDeskRoots) {
  foreach ($relative in @('config\RustDesk.toml', 'config\RustDesk2.toml', 'RustDesk.toml', 'RustDesk2.toml')) {
    $target = Join-Path $rustDeskRoot $relative
    if (Test-Path -LiteralPath $target -PathType Leaf) {
      & attrib.exe -R $target | Out-Null
      & icacls.exe $target /inheritance:e | Out-Null
    }
  }
}

if (Test-Path -LiteralPath $root) {
  foreach ($name in @('agent-config.json', 'update-status.json', 'update-status.tmp', 'installed-version.txt', 'google-oauth-desktop.local.json', 'rustdesk-config.txt', 'rustdesk-policy-run.txt', 'rustdesk-policy-applied.txt')) {
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
