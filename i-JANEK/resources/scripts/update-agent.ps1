$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Join-Path $env:ProgramData 'i-JANEK'
$requestDir = Join-Path $root 'requests'
$cacheDir = Join-Path $root 'cache'
$statusPath = Join-Path $root 'update-status.json'
$versionPath = Join-Path $root 'installed-version.txt'
$configPath = Join-Path $root 'agent-config.json'
$publicKeyPath = Join-Path $PSScriptRoot 'update-signing-public.json'
$headers = @{ 'User-Agent' = 'i-JANEK-Windows-Update-Agent'; 'Accept' = 'application/vnd.github+json' }

function Set-UpdateStatus([string]$state, [string]$version, [string]$message) {
  $record = @{ state = $state; version = $version; requestId = $script:requestId; message = $message; updatedAt = [DateTime]::UtcNow.ToString('o') }
  $json = ConvertTo-Json $record -Compress
  $temporary = Join-Path $root 'update-status.tmp'
  [IO.File]::WriteAllText($temporary, $json, (New-Object Text.UTF8Encoding $false))
  Move-Item -LiteralPath $temporary -Destination $statusPath -Force
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
  $writeMask = [Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Modify -bor [Security.AccessControl.FileSystemRights]::FullControl
  foreach ($rule in $acl.Access) {
    $identity = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($identity -in @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545') -and
        $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
        ($rule.FileSystemRights -band $writeMask) -ne 0) {
      throw 'Katalog instalacji i-JANEK jest zapisywalny dla zwykłych użytkowników.'
    }
  }
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

  Set-UpdateStatus 'ready' $version 'Aktualizacja zweryfikowana. Zamykam aplikację.'
  $deadline = [DateTime]::UtcNow.AddMinutes(5)
  while (@(Get-Process -Name 'i-JANEK' -ErrorAction SilentlyContinue).Count -gt 0) {
    if ([DateTime]::UtcNow -ge $deadline) { throw 'Aplikacja nie zamknęła się przed aktualizacją.' }
    Start-Sleep -Seconds 2
  }

  Set-UpdateStatus 'installing' $version 'Instaluję aktualizację w tle.'
  $installer = Start-Process -FilePath $trustedInstaller -ArgumentList @('/S', '--updated') -PassThru -Wait -WindowStyle Hidden
  if ($installer.ExitCode -ne 0) { throw "Instalator zakończył się błędem $($installer.ExitCode)." }
  [IO.File]::WriteAllText($versionPath, $version, (New-Object Text.UTF8Encoding $false))
  Set-UpdateStatus 'installed' $version 'Aktualizacja została zainstalowana.'
  Remove-Item -LiteralPath $trustedInstaller -Force -ErrorAction SilentlyContinue
}

try {
  New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
  try {
    & (Join-Path $PSScriptRoot 'rustdesk-agent.ps1')
  } catch {
    Write-Warning "Nie udało się zastosować zasad RustDesk: $($_.Exception.Message)"
  }
  $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $appExe = Join-Path ([string]$config.installDir) 'i-JANEK.exe'
  if (-not (Test-Path -LiteralPath $appExe -PathType Leaf)) { throw 'Brakuje aplikacji w katalogu instalacji.' }
  Assert-ProtectedInstallDir ([string]$config.installDir)
  $requests = @(Get-ChildItem -LiteralPath $requestDir -Filter '*.json' -File | Sort-Object LastWriteTimeUtc -Descending)
  if ($requests.Count -eq 0) { exit 0 }
  $requestFile = $requests[0]
  try {
    if (($requestFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Żądanie aktualizacji nie może być dowiązaniem.' }
    $request = Get-Content -LiteralPath $requestFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    $script:requestId = [string]$request.requestId
    Invoke-Update $request $appExe
  } finally {
    Remove-Item -LiteralPath $requestFile.FullName -Force -ErrorAction SilentlyContinue
  }
} catch {
  Set-UpdateStatus 'error' '' $_.Exception.Message
  exit 1
}
