param([string]$ResultPath = (Join-Path $PSScriptRoot '..\dist\windows-update-smoke-result.json'))

$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal $identity
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Uruchom ten test w PowerShellu jako administrator. Test tworzy dwa tymczasowe zadania i usuwa je po sprawdzeniu.'
}
$id = [Guid]::NewGuid().ToString('N')
$testRoot = Join-Path $env:ProgramData "i-JANEK-restart-test-$id"
$userTask = "i-JANEK Restart Test User $id"
$systemTask = "i-JANEK Restart Test SYSTEM $id"
$probePath = Join-Path $testRoot 'RestartProbe.exe'
$jobPath = Join-Path $testRoot 'test-system.ps1'
$result = @{ passed = $false; generatedAt = [DateTime]::UtcNow.ToString('o'); checks = @(); error = '' }

try {
  $session = (Get-Process -Id $PID).SessionId
  $explorer = Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" | Where-Object { $_.SessionId -eq $session } | Select-Object -First 1
  if (-not $explorer) { throw 'Brakuje interaktywnej sesji użytkownika do testu.' }
  $owner = Invoke-CimMethod -InputObject $explorer -MethodName GetOwnerSid
  if ($owner.ReturnValue -ne 0) { throw 'Nie udało się ustalić konta zalogowanego użytkownika.' }
  $userSid = $owner.Sid
  $profile = (Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$userSid").ProfileImagePath
  New-Item -ItemType Directory -Path $testRoot, (Join-Path $testRoot 'requests'), (Join-Path $testRoot 'logs') -Force | Out-Null
  & icacls.exe $testRoot /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' "*$($userSid):(OI)(CI)RX" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Nie udało się zabezpieczyć plików testu SYSTEM.' }
  & icacls.exe (Join-Path $testRoot 'requests') /grant:r "*$($userSid):(OI)(CI)M" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Nie udało się przygotować potwierdzeń testowych.' }
  $resources = Join-Path $PSScriptRoot '..\resources\scripts'
  Copy-Item -LiteralPath (Join-Path $resources 'user-session-restart.cs') -Destination $testRoot
  Copy-Item -LiteralPath (Join-Path $resources 'update-agent.ps1') -Destination $testRoot

  $probeSource = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
class RestartProbe {
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [STAThread] static void Main(string[] args) {
    if (Array.IndexOf(args, "--original") >= 0) { Thread.Sleep(180000); return; }
    string requestId = null;
    foreach (string arg in args) if (arg.StartsWith("--update-request=")) requestId = arg.Substring(17);
    if (requestId == null || Array.IndexOf(args, "--updated") < 0) return;
    bool hidden = Array.IndexOf(args, "--tray") >= 0;
    Form form = null;
    if (!hidden) { form = new Form(); form.Text = "i-JANEK: test restartu Windows"; form.Show(); Application.DoEvents(); }
    string dir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "requests");
    var json = new JavaScriptSerializer();
    var info = new Dictionary<string, object>();
    info["processId"] = Process.GetCurrentProcess().Id;
    info["sessionId"] = Process.GetCurrentProcess().SessionId;
    info["userSid"] = WindowsIdentity.GetCurrent().User.Value;
    info["profile"] = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    info["appData"] = Environment.GetEnvironmentVariable("APPDATA");
    info["hidden"] = hidden;
    info["windowVisible"] = form != null && IsWindowVisible(form.Handle);
    File.WriteAllText(Path.Combine(dir, "probe-" + requestId + ".json"), json.Serialize(info));
    var ack = new Dictionary<string, object>();
    ack["requestId"] = requestId; ack["processId"] = info["processId"]; ack["version"] = "smoke-1";
    string temporary = Path.Combine(dir, "restart-ack-" + requestId + ".tmp");
    File.WriteAllText(temporary, json.Serialize(ack));
    File.Move(temporary, Path.ChangeExtension(temporary, ".json"));
    if (form != null) Application.Run(form); else Thread.Sleep(180000);
  }
}
'@
  Add-Type -TypeDefinition $probeSource -ReferencedAssemblies 'System.dll', 'System.Windows.Forms.dll', 'System.Web.Extensions.dll' -OutputAssembly $probePath -OutputType WindowsApplication
  $powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $action = New-ScheduledTaskAction -Execute $probePath -Argument '--original'
  $userPrincipal = New-ScheduledTaskPrincipal -UserId $userSid -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $userTask -Action $action -Principal $userPrincipal -Settings $settings | Out-Null
  Start-ScheduledTask -TaskName $userTask
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    $original = Get-CimInstance Win32_Process -Filter "Name='RestartProbe.exe'" | Where-Object { $_.ExecutablePath -eq $probePath -and $_.SessionId -eq $session } | Select-Object -First 1
    if (-not $original) { Start-Sleep -Milliseconds 200 }
  } while (-not $original -and [DateTime]::UtcNow -lt $deadline)
  if (-not $original) { throw 'Proces testowy użytkownika nie wystartował.' }

  $job = @'
$ErrorActionPreference = 'Stop'
$testRoot = $PSScriptRoot
try {
  . (Join-Path $testRoot 'update-agent.ps1') -FunctionsOnly
  $root = $testRoot
  $requestDir = Join-Path $root 'requests'
  $updateLogPath = Join-Path $root 'logs\update-agent.log'
  Add-Type -Path (Join-Path $root 'user-session-restart.cs')
  $context = New-Object IJanek.Update.UserSessionRestart -ArgumentList __PROCESS_ID__, (Join-Path $root 'RestartProbe.exe')
  try {
    # Simulate the old application disappearing after the agent captures its session.
    Stop-Process -Id __PROCESS_ID__ -Force
    foreach ($hidden in @($true, $false)) {
      $script:requestId = '__PROCESS_ID__-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      Wait-ApplicationRestart $context $hidden 'smoke-1'
      $probe = Get-Content -LiteralPath (Join-Path $requestDir "probe-$script:requestId.json") -Raw -Encoding UTF8 | ConvertFrom-Json
      Stop-Process -Id $probe.processId -Force
    }
  } finally { $context.Dispose() }
  [IO.File]::WriteAllText((Join-Path $testRoot 'system-result.json'), '{"passed":true}')
} catch {
  [IO.File]::WriteAllText((Join-Path $testRoot 'system-result.json'), (ConvertTo-Json @{ passed = $false; error = ($_ | Out-String) }))
  exit 1
}
'@
  $job = $job.Replace('__PROCESS_ID__', [string]$original.ProcessId)
  [IO.File]::WriteAllText($jobPath, $job, (New-Object Text.UTF8Encoding $true))
  $systemAction = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$jobPath`""
  $systemPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $systemTask -Action $systemAction -Principal $systemPrincipal -Settings $settings | Out-Null
  Start-ScheduledTask -TaskName $systemTask
  $jobResultPath = Join-Path $testRoot 'system-result.json'
  $deadline = [DateTime]::UtcNow.AddMinutes(4)
  while (-not (Test-Path -LiteralPath $jobResultPath) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-Path -LiteralPath $jobResultPath)) { throw 'Zadanie SYSTEM nie ukończyło testu.' }
  $jobResult = Get-Content -LiteralPath $jobResultPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $jobResult.passed) { throw $jobResult.error }
  $probes = @(Get-ChildItem -LiteralPath (Join-Path $testRoot 'requests') -Filter 'probe-*.json' | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json })
  if ($probes.Count -ne 2) { throw 'Test nie wykonał obu trybów restartu.' }
  foreach ($probe in $probes) {
    if ($probe.userSid -ne $userSid -or $probe.userSid -eq 'S-1-5-18' -or $probe.sessionId -ne $session) { throw 'Aplikacja testowa wystartowała na niewłaściwym koncie lub w niewłaściwej sesji.' }
    if ($probe.profile -ne $profile -or -not $probe.appData.StartsWith($profile, [StringComparison]::OrdinalIgnoreCase)) { throw 'Aplikacja otrzymała niewłaściwy profil użytkownika.' }
    if ($probe.windowVisible -eq $probe.hidden) { throw 'Nieprawidłowa widoczność okna po restarcie.' }
  }
  $result.checks = @('SYSTEM prepared user session', 'original process exited', 'normal user token and profile', 'hidden relaunch acknowledged', 'visible relaunch acknowledged')
  $result.passed = $true
} catch {
  $result.error = ($_ | Out-String).Trim()
} finally {
  foreach ($task in @($systemTask, $userTask)) {
    if (Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue) {
      Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $task -Confirm:$false
    }
  }
  Get-CimInstance Win32_Process -Filter "Name='RestartProbe.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -eq $probePath } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -PassThru -ErrorAction SilentlyContinue | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
  New-Item -ItemType Directory -Path (Split-Path -Parent $ResultPath) -Force | Out-Null
  [IO.File]::WriteAllText($ResultPath, (ConvertTo-Json $result -Depth 4), (New-Object Text.UTF8Encoding $false))
}
if (-not $result.passed) { throw "Test restartu nie przeszedł: $($result.error)" }
Write-Host 'OK: agent SYSTEM uruchomił aplikację jako użytkownik po zakończeniu starego procesu, w obu trybach.'
Write-Host "Wynik: $ResultPath"
