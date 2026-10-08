param([switch]$FunctionsOnly)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Join-Path $env:ProgramData 'i-JANEK'
$requestDir = Join-Path $root 'requests'
$cacheDir = Join-Path $root 'cache'
$statusPath = Join-Path $root 'update-status.json'
$dwServiceStatusPath = Join-Path $root 'dwservice-status.json'
$versionPath = Join-Path $root 'installed-version.txt'
$configPath = Join-Path $root 'agent-config.json'
$publicKeyPath = Join-Path $PSScriptRoot 'update-signing-public.json'
$headers = @{ 'User-Agent' = 'i-JANEK-Windows-Update-Agent'; 'Accept' = 'application/vnd.github+json' }
$script:restartPrepared = $false
$updateLogPath = Join-Path $root 'logs\update-agent.log'

function Write-UpdateLog([string]$message) {
  try {
    Add-Content -LiteralPath $updateLogPath -Value "[$([DateTime]::UtcNow.ToString('o'))] Request=$script:requestId $message" -Encoding UTF8
  } catch { }
}

function Set-UpdateStatus([string]$state, [string]$version, [string]$message) {
  $record = @{ state = $state; version = $version; requestId = $script:requestId; message = $message; updatedAt = [DateTime]::UtcNow.ToString('o'); restartProtocol = 2; restartPrepared = $script:restartPrepared }
  $json = ConvertTo-Json $record -Compress
  $temporary = Join-Path $root 'update-status.tmp'
  [IO.File]::WriteAllText($temporary, $json, (New-Object Text.UTF8Encoding $false))
  Move-Item -LiteralPath $temporary -Destination $statusPath -Force
  Write-UpdateLog "State=$state Version=$version $message"
}

function Set-DwServiceStatus([string]$state, [string]$configurationId, [string]$appliedCodeHash, [string]$message) {
  $record = @{
    status = $state
    configurationId = $configurationId
    appliedCodeHash = $appliedCodeHash
    error = $message
    updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }
  $temporary = Join-Path $root 'dwservice-status.tmp'
  [IO.File]::WriteAllText($temporary, (ConvertTo-Json $record -Compress), (New-Object Text.UTF8Encoding $false))
  Move-Item -LiteralPath $temporary -Destination $dwServiceStatusPath -Force
}

function Get-Sha256Text([string]$value) {
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = (New-Object Text.UTF8Encoding $false).GetBytes($value)
    return ([BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }
}

function Assert-DwServiceAssignment($request, [string]$code, [string]$configurationId) {
  $deviceId = [string]$request.deviceId
  $projectId = [string]$request.firebaseProjectId
  $idToken = [string]$request.firebaseIdToken
  if ($deviceId -notmatch '^[A-Z0-9_]{3,160}$') { throw 'Nieprawidłowy identyfikator urządzenia.' }
  if ($projectId -notmatch '^[a-z0-9][a-z0-9-]{4,61}[a-z0-9]$') { throw 'Nieprawidłowy identyfikator projektu Firebase.' }
  if ([string]::IsNullOrWhiteSpace($idToken) -or $idToken.Length -gt 8192 -or @($idToken.Split('.')).Count -ne 3) {
    throw 'Brakuje prawidłowego potwierdzenia sesji Firebase.'
  }

  $escapedDeviceId = [Uri]::EscapeDataString($deviceId)
  $uri = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/devices/$escapedDeviceId"
  $document = Invoke-RestMethod -Method Get -Uri $uri -Headers @{ Authorization = "Bearer $idToken" } -UseBasicParsing
  $fields = $document.fields
  if ([string]$fields.approvalStatus.stringValue -ne 'approved') { throw 'Urządzenie nie jest zatwierdzone.' }
  if ([string]$fields.dwservice.mapValue.fields.configurationId.stringValue -ne $configurationId) {
    throw 'Konfiguracja DWService została zmieniona. Pobierz aktualne dane.'
  }
  if ([string]$fields.dwservice.mapValue.fields.installationCode.stringValue -ne $code) {
    throw 'Kod DWService nie zgadza się z przypisaniem administratora.'
  }
}

function Invoke-DwServiceConfiguration($request) {
  $code = [string]$request.installationCode
  $configurationId = [string]$request.configurationId
  if ($code -notmatch '^\d{3}-\d{3}-\d{3}$') { throw 'Kod DWService ma nieprawidłowy format.' }
  if ($configurationId -notmatch '^[A-Za-z0-9-]{8,80}$') { throw 'Nieprawidłowy identyfikator konfiguracji DWService.' }
  Assert-DwServiceAssignment $request $code $configurationId

  Set-DwServiceStatus 'installing' $configurationId '' ''
  $installerPath = Join-Path $cacheDir 'dwagent.exe'
  $logPath = Join-Path $root 'dwservice-install.log'
  Invoke-WebRequest -Uri 'https://www.dwservice.net/download/dwagent.exe' -OutFile $installerPath -UseBasicParsing
  $installer = Get-Item -LiteralPath $installerPath
  if ($installer.Length -le 0 -or $installer.Length -gt 250MB) { throw 'Pobrany instalator DWService ma nieprawidłowy rozmiar.' }
  if (($installer.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Instalator DWService nie może być dowiązaniem.' }
  $signature = Get-AuthenticodeSignature -FilePath $installerPath
  if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    throw "Instalator DWService nie ma prawidłowego podpisu cyfrowego: $($signature.Status)."
  }

  $process = Start-Process -FilePath $installerPath -ArgumentList @(
    '-silent',
    "key=$code",
    "logpath=$logPath"
  ) -PassThru -Wait -WindowStyle Hidden
  if ($process.ExitCode -ne 0) { throw "Instalator DWService zakończył się błędem $($process.ExitCode)." }
  $service = Get-Service -Name 'DWAgent' -ErrorAction SilentlyContinue
  if (-not $service) { throw 'Usługa DWAgent nie została zainstalowana.' }
  if ($service.Status -ne 'Running') {
    Start-Service -Name 'DWAgent'
    $service.WaitForStatus('Running', (New-TimeSpan -Seconds 30))
  }
  Set-DwServiceStatus 'ready' $configurationId (Get-Sha256Text $code) ''
  Remove-Item -LiteralPath $installerPath -Force -ErrorAction SilentlyContinue
}

function Process-DwServiceRequests() {
  $requests = @(Get-ChildItem -LiteralPath $requestDir -Filter 'dwservice-*.json' -File | Sort-Object LastWriteTimeUtc -Descending)
  if ($requests.Count -eq 0) { return }
  $requestFile = $requests[0]
  $configurationId = ''
  try {
    if (($requestFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Żądanie DWService nie może być dowiązaniem.' }
    $request = Get-Content -LiteralPath $requestFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    $configurationId = [string]$request.configurationId
    Invoke-DwServiceConfiguration $request
  } catch {
    Set-DwServiceStatus 'error' $configurationId '' $_.Exception.Message
  } finally {
    foreach ($entry in $requests) {
      Remove-Item -LiteralPath $entry.FullName -Force -ErrorAction SilentlyContinue
    }
  }
}

function Convert-Base64Url([string]$value) {
  $normalized = $value.Replace('-', '+').Replace('_', '/')
  $normalized += '=' * ((4 - ($normalized.Length % 4)) % 4)
  return [Convert]::FromBase64String($normalized)
}

function Assert-SignedManifest([string]$manifestPath, [string]$signaturePath) {
  $public = Get-Content -LiteralPath $publicKeyPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($public.kty -ne 'RSA') { throw 'Nieprawidłowy klucz aktualizacji.' }
  $parameters = New-Object System.Security.Cryptography.RSAParameters
  $parameters.Modulus = Convert-Base64Url $public.n
  $parameters.Exponent = Convert-Base64Url $public.e
  $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider
  try {
    $rsa.ImportParameters($parameters)
    $bytes = [IO.File]::ReadAllBytes($manifestPath)
    $signature = [Convert]::FromBase64String(([IO.File]::ReadAllText($signaturePath)).Trim())
    if (-not $rsa.VerifyData($bytes, 'SHA256', $signature)) {
      throw 'Podpis manifestu aktualizacji jest nieprawidłowy.'
    }
  } finally {
    $rsa.Dispose()
  }
  return (Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Compare-AppVersion([string]$left, [string]$right) {
  $pattern = '^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$'
  $a = [regex]::Match($left, $pattern)
  $b = [regex]::Match($right, $pattern)
  if (-not $a.Success -or -not $b.Success) { throw 'Nieprawidłowy numer wersji aktualizacji.' }
  for ($index = 1; $index -le 3; $index++) {
    $difference = [int]$a.Groups[$index].Value - [int]$b.Groups[$index].Value
    if ($difference -ne 0) { return [Math]::Sign($difference) }
  }
  $ranks = @{ alpha = 0; beta = 1; stable = 2 }
  $aStage = if ($a.Groups[4].Success) { $a.Groups[4].Value } else { 'stable' }
  $bStage = if ($b.Groups[4].Success) { $b.Groups[4].Value } else { 'stable' }
  $difference = $ranks[$aStage] - $ranks[$bStage]
  if ($difference -ne 0) { return [Math]::Sign($difference) }
  if ($aStage -eq 'stable') { return 0 }
  return [Math]::Sign(([int]$a.Groups[5].Value) - ([int]$b.Groups[5].Value))
}

function Get-Asset($release, [string]$name) {
  $asset = @($release.assets | Where-Object { $_.name -eq $name })
  if ($asset.Count -ne 1) { throw "W wydaniu brakuje pliku $name." }
  $expectedPrefix = "https://github.com/igorjanicki27-coder/I-janicki.pl/releases/download/$($release.tag_name)/"
  if (-not $asset[0].browser_download_url.StartsWith($expectedPrefix, [StringComparison]::Ordinal)) {
    throw 'Nieprawidłowy adres pliku wydania.'
  }
  return $asset[0].browser_download_url
}

function Get-InstalledVersion([string]$appExe) {
  $packagedVersionPath = Join-Path (Split-Path -Parent $appExe) 'resources\resources\scripts\app-version.txt'
  if (Test-Path -LiteralPath $packagedVersionPath) {
    $packaged = (Get-Content -LiteralPath $packagedVersionPath -Raw -Encoding UTF8).Trim()
    if ($packaged -match '^\d+\.\d+\.\d+(?:-(?:alpha|beta)\.\d+)?$') { return $packaged }
  }
  if (Test-Path -LiteralPath $versionPath) {
    $saved = (Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8).Trim()
    if ($saved -match '^\d+\.\d+\.\d+(?:-(?:alpha|beta)\.\d+)?$') { return $saved }
  }
  $fileVersion = (Get-Item -LiteralPath $appExe).VersionInfo.ProductVersion
  $match = [regex]::Match($fileVersion, '^\d+\.\d+\.\d+')
  if ($match.Success) { return $match.Value }
  return '0.0.0'
}

function Assert-ProtectedInstallDir([string]$installDir) {
  $fullPath = [IO.Path]::GetFullPath($installDir).TrimEnd('\')
  $programFiles = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
  $insideProgramFiles = @($programFiles | Where-Object {
    $fullPath.StartsWith(([IO.Path]::GetFullPath($_).TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)
  }).Count -gt 0
  if (-not $insideProgramFiles) { throw 'Instalacja i-JANEK nie znajduje się w chronionym katalogu Program Files.' }
  if (((Get-Item -LiteralPath $fullPath).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Katalog instalacji i-JANEK nie może być dowiązaniem.'
  }
  $acl = Get-Acl -LiteralPath $fullPath
  $writeMask = [Security.AccessControl.FileSystemRights]::WriteData `
    -bor [Security.AccessControl.FileSystemRights]::AppendData `
    -bor [Security.AccessControl.FileSystemRights]::WriteExtendedAttributes `
    -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles `
    -bor [Security.AccessControl.FileSystemRights]::WriteAttributes `
    -bor [Security.AccessControl.FileSystemRights]::Delete `
    -bor [Security.AccessControl.FileSystemRights]::ChangePermissions `
    -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
  $accessRules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
  foreach ($rule in $accessRules) {
    $identity = $rule.IdentityReference.Value
    if ($identity -in @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545') -and
        $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
        ($rule.FileSystemRights -band $writeMask) -ne 0) {
      throw 'Katalog instalacji i-JANEK jest zapisywalny dla zwykłych użytkowników.'
    }
  }
}

function Get-RunningApplicationProcesses([string]$appExe) {
  @(Get-CimInstance Win32_Process -Filter "Name='i-JANEK.exe'" | Where-Object {
    $_.ExecutablePath -and [string]::Equals([IO.Path]::GetFullPath($_.ExecutablePath), [IO.Path]::GetFullPath($appExe), [StringComparison]::OrdinalIgnoreCase)
  })
}

function Wait-ApplicationRestart($context, [bool]$startHidden, [string]$version) {
  $ackPath = Join-Path $requestDir "restart-ack-$script:requestId.json"
  Remove-Item -LiteralPath $ackPath -Force -ErrorAction SilentlyContinue
  $launchedId = $context.Launch($startHidden, $script:requestId)
  Write-UpdateLog "Native launch PID=$launchedId Session=$($context.SessionId) Hidden=$startHidden"
  $deadline = [DateTime]::UtcNow.AddSeconds(90)
  while ([DateTime]::UtcNow -lt $deadline) {
    $process = Get-Process -Id $launchedId -ErrorAction SilentlyContinue
    if (-not $process) { throw 'Aplikacja zakończyła się podczas ponownego uruchamiania.' }
    if (Test-Path -LiteralPath $ackPath -PathType Leaf) {
      $file = Get-Item -LiteralPath $ackPath
      if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $file.Length -gt 4096) { throw 'Nieprawidłowe potwierdzenie restartu.' }
      try { $ack = Get-Content -LiteralPath $ackPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $ack = $null }
      if ($ack -and $ack.requestId -eq $script:requestId -and $ack.version -eq $version -and $ack.processId -eq $launchedId -and $process.SessionId -eq $context.SessionId) {
        Remove-Item -LiteralPath $ackPath -Force
        Write-UpdateLog "Application acknowledged renderer startup PID=$launchedId Version=$version"
        return
      }
    }
    Start-Sleep -Milliseconds 500
  }
  throw 'Nowa aplikacja nie potwierdziła uruchomienia w ciągu 90 sekund. Sprawdź logs\update-agent.log.'
}

function Invoke-Update($request, [string]$appExe) {
  $version = [string]$request.version
  $channel = [string]$request.channel
  $sourcePath = [string]$request.installerPath
  if ([string]$request.requestId -notmatch '^\d+-\d+$') { throw 'Nieprawidłowy identyfikator żądania.' }
  if ($version -notmatch '^\d+\.\d+\.\d+(?:-(?:alpha|beta)\.\d+)?$') { throw 'Nieprawidłowa wersja żądania.' }
  if ($channel -notin @('latest', 'beta', 'test')) { throw 'Nieprawidłowy kanał żądania.' }
  if ($sourcePath -notmatch '^[A-Za-z]:\\' -or [IO.Path]::GetExtension($sourcePath) -ne '.exe') {
    throw 'Nieprawidłowa lokalna ścieżka instalatora.'
  }
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw 'Pobrany instalator nie jest dostępny.' }
  $sourceFile = Get-Item -LiteralPath $sourcePath
  if (($sourceFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Instalator nie może być dowiązaniem.' }
  if ($sourceFile.Length -gt 800MB) { throw 'Instalator jest zbyt duży.' }

  $installedVersion = Get-InstalledVersion $appExe
  if ((Compare-AppVersion $version $installedVersion) -le 0) {
    Set-UpdateStatus 'installed' $installedVersion 'Ta wersja jest już zainstalowana.'
    return
  }

  Set-UpdateStatus 'verifying' $version 'Weryfikuję podpis aktualizacji.'
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/igorjanicki27-coder/I-janicki.pl/releases/tags/i-janek-v$version" -Headers $headers
  if ($release.tag_name -ne "i-janek-v$version") { throw 'Nieprawidłowy tag wydania.' }
  $manifestPath = Join-Path $cacheDir 'update-windows.json'
  $signaturePath = Join-Path $cacheDir 'update-windows.sig'
  Invoke-WebRequest -Uri (Get-Asset $release 'update-windows.json') -Headers $headers -OutFile $manifestPath -UseBasicParsing
  Invoke-WebRequest -Uri (Get-Asset $release 'update-windows.sig') -Headers $headers -OutFile $signaturePath -UseBasicParsing
  $manifest = Assert-SignedManifest $manifestPath $signaturePath
  $assetName = "i-JANEK-Setup-$version.exe"
  if ($manifest.schema -ne 1 -or $manifest.version -ne $version -or $manifest.channel -ne $channel -or $manifest.asset -ne $assetName) {
    throw 'Podpisany manifest nie odpowiada żądanej aktualizacji.'
  }
  if ($manifest.sha512 -notmatch '^[A-Za-z0-9+/]{86}==$') { throw 'Nieprawidłowa suma kontrolna manifestu.' }
  $null = Get-Asset $release $assetName

  Set-UpdateStatus 'verifying' $version 'Sprawdzam pobrany instalator.'
  $trustedInstaller = Join-Path $cacheDir $assetName
  Copy-Item -LiteralPath $sourcePath -Destination $trustedInstaller -Force
  $stream = [IO.File]::OpenRead($trustedInstaller)
  try {
    $sha512 = [Security.Cryptography.SHA512]::Create()
    try { $actualHash = [Convert]::ToBase64String($sha512.ComputeHash($stream)) }
    finally { $sha512.Dispose() }
  } finally {
    $stream.Dispose()
  }
  if ($actualHash -cne $manifest.sha512) {
    Remove-Item -LiteralPath $trustedInstaller -Force
    throw 'Suma kontrolna instalatora jest niezgodna z podpisanym manifestem.'
  }

  if ($request.restartProtocol -ne 2 -or $request.processId -ne [int]($script:requestId.Split('-')[0]) -or $request.startHidden -isnot [bool]) {
    throw 'Aplikacja wymaga jednorazowej naprawy najnowszym instalatorem i-JANEK.'
  }
  if (-not ('IJanek.Update.UserSessionRestart' -as [type])) {
    Add-Type -Path (Join-Path $PSScriptRoot 'user-session-restart.cs')
  }
  $context = New-Object IJanek.Update.UserSessionRestart -ArgumentList ([int]$request.processId), $appExe
  $applicationClosed = $false
  $installationComplete = $false
  try {
    $otherSessions = @(Get-RunningApplicationProcesses $appExe | Where-Object { $_.SessionId -ne $context.SessionId })
    if ($otherSessions.Count -gt 0) { throw 'Zamknij i-JANEK na pozostałych kontach Windows przed aktualizacją.' }
    Write-UpdateLog "Restart prepared Session=$($context.SessionId) RequesterPID=$($context.OriginalProcessId) Hidden=$($request.startHidden)"
    $script:restartPrepared = $true
    Set-UpdateStatus 'ready' $version 'Aktualizacja zweryfikowana. Zamykam aplikację.'
    $deadline = [DateTime]::UtcNow.AddMinutes(5)
    while (@(Get-RunningApplicationProcesses $appExe).Count -gt 0) {
      if ([DateTime]::UtcNow -ge $deadline) { throw 'Aplikacja nie zamknęła się przed aktualizacją.' }
      Start-Sleep -Seconds 2
    }
    $applicationClosed = $true

    Set-UpdateStatus 'installing' $version 'Instaluję aktualizację w tle.'
    $installer = Start-Process -FilePath $trustedInstaller -ArgumentList @('/S', '--updated') -PassThru -Wait -WindowStyle Hidden
    if ($installer.ExitCode -ne 0) { throw "Instalator zakończył się błędem $($installer.ExitCode)." }
    # The installed package itself, not just NSIS's exit code, must have the target version.
    if ((Get-InstalledVersion $appExe) -ne $version) { throw 'Po instalacji aplikacja ma nieprawidłową wersję.' }
    $installationComplete = $true
    [IO.File]::WriteAllText($versionPath, $version, (New-Object Text.UTF8Encoding $false))
    Set-UpdateStatus 'restarting' $version 'Uruchamiam zaktualizowaną aplikację.'
    Wait-ApplicationRestart $context ([bool]$request.startHidden) $version
    Set-UpdateStatus 'installed' $version 'Aktualizacja została zainstalowana.'
    Remove-Item -LiteralPath $trustedInstaller -Force -ErrorAction SilentlyContinue
  } catch {
    $failure = $_
    if ($applicationClosed -and -not $installationComplete -and (Test-Path -LiteralPath $appExe -PathType Leaf)) {
      try {
        $recoveryId = $context.Launch([bool]$request.startHidden, $script:requestId)
        Write-UpdateLog "Installer failed; attempted recovery PID=$recoveryId"
      } catch { Write-UpdateLog "Recovery failed: $($_.Exception.Message)" }
    }
    throw $failure
  } finally {
    $script:restartPrepared = $false
    $context.Dispose()
  }
}

if ($FunctionsOnly) { return }

try {
  New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
  Process-DwServiceRequests
  $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $appExe = Join-Path ([string]$config.installDir) 'i-JANEK.exe'
  if (-not (Test-Path -LiteralPath $appExe -PathType Leaf)) { throw 'Brakuje aplikacji w katalogu instalacji.' }
  $requests = @(Get-ChildItem -LiteralPath $requestDir -Filter 'request-*.json' -File | Sort-Object LastWriteTimeUtc -Descending)
  if ($requests.Count -eq 0) { exit 0 }
  $requestFile = $requests[0]
  try {
    if (($requestFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Żądanie aktualizacji nie może być dowiązaniem.' }
    $request = Get-Content -LiteralPath $requestFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    $script:requestId = [string]$request.requestId
    Assert-ProtectedInstallDir ([string]$config.installDir)
    Invoke-Update $request $appExe
  } finally {
    Remove-Item -LiteralPath $requestFile.FullName -Force -ErrorAction SilentlyContinue
  }
} catch {
  Set-UpdateStatus 'error' '' $_.Exception.Message
  exit 1
}
