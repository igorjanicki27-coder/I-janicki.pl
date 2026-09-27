!macro customInstall
  ExecWait '"$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe" -ExecutionPolicy Bypass -NoProfile -File "$INSTDIR\\resources\\scripts\\install.ps1"'
!macroend

!macro customUnInstall
  ExecWait '"$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe" -ExecutionPolicy Bypass -NoProfile -File "$INSTDIR\\resources\\scripts\\uninstall.ps1"'
!macroend
