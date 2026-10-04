!include "x64.nsh"

!macro customCheckAppRunning
  DetailPrint "Zamykanie dzialajacej aplikacji i-JANEK..."
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  Sleep 750
!macroend

!macro customInstall
  CreateDirectory "$APPDATA\i-JANEK"
  StrCpy $1 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  ${if} ${RunningX64}
  ${andIf} ${FileExists} "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
    StrCpy $1 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  ${endif}
  FileOpen $2 "$APPDATA\i-JANEK\installer-bootstrap.log" a
  FileWrite $2 "Uruchamiam: $1$\r$\n"
  FileWrite $2 "Skrypt: $INSTDIR\resources\resources\scripts\install.ps1$\r$\n"
  FileClose $2
  ExecWait '"$1" -ExecutionPolicy Bypass -NoProfile -NonInteractive -File "$INSTDIR\resources\resources\scripts\install.ps1" -InstallDir "$INSTDIR"' $0
  FileOpen $2 "$APPDATA\i-JANEK\installer-bootstrap.log" a
  FileWrite $2 "Kod wyjscia: $0$\r$\n"
  FileClose $2
  ${if} $0 != 0
    Abort "Nie udało się zainstalować agenta aktualizacji i-JANEK. Szczegóły: C:\ProgramData\i-JANEK\installer-bootstrap.log"
  ${endif}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    StrCpy $1 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
    ${if} ${RunningX64}
    ${andIf} ${FileExists} "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
      StrCpy $1 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
    ${endif}
    ExecWait '"$1" -ExecutionPolicy Bypass -NoProfile -NonInteractive -File "$INSTDIR\resources\resources\scripts\uninstall.ps1"' $0
  ${endif}
!macroend
