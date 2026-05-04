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

$backupRoot = Join-Path $env:USERPROFILE "i-JANEK_Backup"
if (Test-Path $backupRoot) {
  Write-Host "Backup root detected at $backupRoot. User may choose to remove it manually."
}
