param(
  [string]$CertPath
)

$ErrorActionPreference = "Stop"
$appName = "i-JANEK"

if (Test-Path $CertPath) {
  Import-Certificate -FilePath $CertPath -CertStoreLocation "Cert:\\LocalMachine\\Root" | Out-Null
}

$runKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
$exePath = Join-Path $PSScriptRoot "..\\..\\i-JANEK.exe"
if (Test-Path $exePath) {
  New-Item -Path $runKey -Force | Out-Null
  Set-ItemProperty -Path $runKey -Name $appName -Value ('"' + (Resolve-Path $exePath).Path + '" --tray')
}
