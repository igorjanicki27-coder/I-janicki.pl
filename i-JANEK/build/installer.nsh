!macro customInstall
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -NoProfile -NonInteractive -File "$INSTDIR\resources\resources\scripts\install.ps1" -InstallDir "$INSTDIR"' $0
  ${if} $0 != 0
    Abort "Nie udało się zainstalować agenta aktualizacji i-JANEK."
  ${endif}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -NoProfile -NonInteractive -File "$INSTDIR\resources\resources\scripts\uninstall.ps1"' $0
  ${endif}
!macroend
