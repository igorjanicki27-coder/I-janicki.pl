param([Parameter(Mandatory=$true)][string]$InstallDir)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:ProgramData 'i-JANEK'
$agentDir = Join-Path $root 'agent'
$requestsDir = Join-Path $root 'requests'
$cacheDir = Join-Path $root 'cache'
$sourceDir = Join-Path $InstallDir 'resources\resources\scripts'
$taskName = 'i-JANEK Update Agent'

if (-not (Test-Path -LiteralPath (Join-Path $sourceDir 'update-agent.ps1'))) {
  throw 'Brakuje plików agenta aktualizacji w instalatorze.'
}
if (-not (Test-Path -LiteralPath (Join-Path $sourceDir 'update-signing-public.json'))) {
  throw 'Brakuje publicznego klucza aktualizacji w instalatorze.'
}

New-Item -ItemType Directory -Path $agentDir, $requestsDir, $cacheDir -Force | Out-Null
foreach ($protectedDir in @($root, $agentDir, $cacheDir, $requestsDir)) {
  & icacls.exe $protectedDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Nie udało się zabezpieczyć katalogu $protectedDir." }
}
& icacls.exe $cacheDir /inheritance:r /remove:g '*S-1-5-32-545' /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Nie udało się zabezpieczyć katalogu pobranych aktualizacji.' }
& icacls.exe $requestsDir /grant:r '*S-1-5-32-545:(OI)(CI)M' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Nie udało się nadać uprawnień do zgłoszeń aktualizacji.' }

Copy-Item -LiteralPath (Join-Path $sourceDir 'update-agent.ps1') -Destination (Join-Path $agentDir 'update-agent.ps1') -Force
Copy-Item -LiteralPath (Join-Path $sourceDir 'update-signing-public.json') -Destination (Join-Path $agentDir 'update-signing-public.json') -Force
Copy-Item -LiteralPath (Join-Path $sourceDir 'rustdesk-agent.ps1') -Destination (Join-Path $agentDir 'rustdesk-agent.ps1') -Force
$config = @{ installDir = (Resolve-Path -LiteralPath $InstallDir).Path } | ConvertTo-Json -Compress
[IO.File]::WriteAllText((Join-Path $root 'agent-config.json'), $config, (New-Object Text.UTF8Encoding $false))
$googleOAuthSource = Join-Path $InstallDir 'resources\resources\google-oauth-desktop.local.json'
if (Test-Path -LiteralPath $googleOAuthSource -PathType Leaf) {
  Copy-Item -LiteralPath $googleOAuthSource -Destination (Join-Path $root 'google-oauth-desktop.local.json') -Force
}
$rustDeskConfig = Join-Path $InstallDir 'resources\resources\rustdesk-config.local.txt'
$protectedRustDeskConfig = Join-Path $root 'rustdesk-config.txt'
if (Test-Path -LiteralPath $rustDeskConfig -PathType Leaf) {
  Copy-Item -LiteralPath $rustDeskConfig -Destination $protectedRustDeskConfig -Force
  Remove-Item -LiteralPath (Join-Path $root 'rustdesk-policy-run.txt') -Force -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath $protectedRustDeskConfig -PathType Leaf) {
  & icacls.exe $protectedRustDeskConfig /inheritance:r /remove:g '*S-1-5-32-545' /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Nie udało się zabezpieczyć konfiguracji RustDesk.' }
}

if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
  $powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $scriptPath = Join-Path $agentDir 'update-agent.ps1'
  $action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`""
  $startup = New-ScheduledTaskTrigger -AtStartup
  $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -StartWhenAvailable
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($startup, $repeat) -Principal $principal -Settings $settings -Force | Out-Null
}
