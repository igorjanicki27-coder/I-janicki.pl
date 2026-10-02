$ErrorActionPreference = 'Stop'
$root = Join-Path $env:ProgramData 'i-JANEK'
$configPath = Join-Path $root 'rustdesk-config.txt'
$agentConfigPath = Join-Path $root 'agent-config.json'
$lastRunPath = Join-Path $root 'rustdesk-policy-run.txt'
$appliedPath = Join-Path $root 'rustdesk-policy-applied.txt'

if (Test-Path -LiteralPath $lastRunPath) {
  $lastRun = [DateTime]::MinValue
  if ([DateTime]::TryParse((Get-Content -LiteralPath $lastRunPath -Raw), [ref]$lastRun)) {
    if ([DateTime]::UtcNow - $lastRun.ToUniversalTime() -lt [TimeSpan]::FromHours(24)) { return }
  }
}

if (Test-Path -LiteralPath $configPath) {
  $configString = (Get-Content -LiteralPath $configPath -Raw -Encoding UTF8).Trim()
  if ($configString -and -not $configString.StartsWith('#') -and $configString.Length -le 4096 -and $configString -notmatch '[\r\n]') {
    $agentConfig = Get-Content -LiteralPath $agentConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $installDir = [string]$agentConfig.installDir
    $candidates = @(
      (Join-Path $installDir 'resources\resources\rd-core.exe'),
      (Join-Path $env:ProgramFiles 'RustDesk\rustdesk.exe')
    )
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'RustDesk\rustdesk.exe') }
    $binary = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if ($binary) {
      $process = Start-Process -FilePath $binary -ArgumentList @('--config', $configString) -WindowStyle Hidden -Wait -PassThru
      if ($process.ExitCode -ne 0) { throw 'RustDesk nie przyjął konfiguracji systemowej.' }
      [IO.File]::WriteAllText($appliedPath, [DateTime]::UtcNow.ToString('o'), (New-Object Text.UTF8Encoding $false))
    }
  }
}

$lockConfig = [Environment]::GetEnvironmentVariable('RUSTDESK_LOCK_CONFIG', 'Machine')
if ($lockConfig -ne '0') {
  $serviceRoot = Join-Path $env:WINDIR 'ServiceProfiles\LocalService\AppData\Roaming\RustDesk'
  $targets = @(
    (Join-Path $serviceRoot 'config\RustDesk.toml'),
    (Join-Path $serviceRoot 'config\RustDesk2.toml'),
    (Join-Path $serviceRoot 'RustDesk.toml'),
    (Join-Path $serviceRoot 'RustDesk2.toml')
  )
  foreach ($target in $targets) {
    if (Test-Path -LiteralPath $target -PathType Leaf) {
      & attrib.exe +R $target | Out-Null
      & icacls.exe $target /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' '*S-1-5-32-545:R' | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Nie udało się zabezpieczyć konfiguracji RustDesk: $target" }
    }
  }
}

[IO.File]::WriteAllText($lastRunPath, [DateTime]::UtcNow.ToString('o'), (New-Object Text.UTF8Encoding $false))
