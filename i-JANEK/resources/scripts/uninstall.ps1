param(
  [string]$CertPath
)

$ErrorActionPreference = "SilentlyContinue"
$appName = "i-JANEK"

$runKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
Remove-ItemProperty -Path $runKey -Name $appName

if (Test-Path $CertPath) {
  $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertPath)
  Get-ChildItem "Cert:\\LocalMachine\\Root" | Where-Object { $_.Thumbprint -eq $cert.Thumbprint } | Remove-Item
}

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

[Environment]::SetEnvironmentVariable("RUSTDESK_IDENTITY", $null, "Machine")
