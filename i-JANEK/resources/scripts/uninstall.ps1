$ErrorActionPreference = "SilentlyContinue"
$appName = "i-JANEK"

$runKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
Remove-ItemProperty -Path $runKey -Name $appName

$cleanupPaths = @(
  (Join-Path $env:USERPROFILE "i-JANEK"),
  (Join-Path $env:USERPROFILE "i-JANEK_Backup"),
  (Join-Path $env:APPDATA "i-JANEK"),
  (Join-Path $env:APPDATA "i-janek"),
  (Join-Path $env:LOCALAPPDATA "i-JANEK"),
  (Join-Path $env:LOCALAPPDATA "i-janek")
)

foreach ($path in $cleanupPaths) {
  if (Test-Path $path) {
    Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

foreach ($oauthTarget in @(
  (Join-Path $env:APPDATA "i-janek\google-oauth-desktop.local.json"),
  (Join-Path $env:APPDATA "i-JANEK\google-oauth-desktop.local.json")
)) {
  if (Test-Path $oauthTarget) {
    Remove-Item -Path $oauthTarget -Force -ErrorAction SilentlyContinue
  }
}

$rustDeskTargets = @(
  (Join-Path $env:APPDATA "RustDesk\config\RustDesk.toml"),
  (Join-Path $env:APPDATA "RustDesk\config\RustDesk2.toml"),
  (Join-Path $env:APPDATA "RustDesk\RustDesk.toml"),
  (Join-Path $env:APPDATA "RustDesk\RustDesk2.toml"),
  (Join-Path $env:WINDIR "ServiceProfiles\LocalService\AppData\Roaming\RustDesk\config\RustDesk.toml"),
  (Join-Path $env:WINDIR "ServiceProfiles\LocalService\AppData\Roaming\RustDesk\config\RustDesk2.toml"),
  (Join-Path $env:WINDIR "ServiceProfiles\LocalService\AppData\Roaming\RustDesk\RustDesk.toml"),
  (Join-Path $env:WINDIR "ServiceProfiles\LocalService\AppData\Roaming\RustDesk\RustDesk2.toml")
)

foreach ($target in $rustDeskTargets) {
  if (Test-Path $target) {
    attrib -R $target | Out-Null
    icacls $target /inheritance:e | Out-Null
  }
}
