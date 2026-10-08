!include "x64.nsh"
!include "MUI2.nsh"
!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER
Var DWServiceConsentCheckbox
Var DWServiceCodePart1Input
Var DWServiceCodePart2Input
Var DWServiceCodePart3Input
Var DWServiceConsentAccepted
Var DWServiceInstallationCode
Var DWServiceExistingInstall

!define DW_SERVICE_REQUIRED_INSTALLATION_CODE "000-000-000"

!macro customInit
  StrCpy $DWServiceConsentAccepted "false"
  StrCpy $DWServiceInstallationCode ""
  StrCpy $DWServiceExistingInstall "false"
  ReadRegStr $0 HKLM "Software\${APP_GUID}" InstallLocation
  ${If} $0 != ""
    StrCpy $DWServiceExistingInstall "true"
  ${EndIf}
  ${If} ${Silent}
  ${AndIf} $DWServiceExistingInstall != "true"
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom dwServiceConsentPageCreate dwServiceConsentPageLeave
!macroend

Function dwServiceConsentPageCreate
  ${If} $DWServiceExistingInstall == "true"
    Abort
  ${EndIf}
  ${If} ${Silent}
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "Zdalne wsparcie DWService" "Zgoda wymagana przed instalacją i-JANEK"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 34u "i-JANEK korzysta z DWService do zdalnej pomocy technicznej. Sam agent nie zostanie jeszcze pobrany ani uruchomiony."
  Pop $0

  ${NSD_CreateCheckbox} 0 40u 100% 38u "Wyrażam zgodę na instalację komponentu zdalnego wsparcia DWService na tym urządzeniu oraz jego wykorzystanie przez i-JANICKI do świadczenia usług zdalnego wsparcia."
  Pop $DWServiceConsentCheckbox

  ${NSD_CreateLabel} 0 88u 100% 14u "Kod instalacyjny DWService (wymagany)"
  Pop $0
  ${NSD_CreateNumber} 0 106u 48u 13u ""
  Pop $DWServiceCodePart1Input
  SendMessage $DWServiceCodePart1Input ${EM_LIMITTEXT} 3 0
  ${NSD_OnChange} $DWServiceCodePart1Input dwServiceCodePart1Changed
  ${NSD_CreateLabel} 52u 107u 8u 13u "-"
  Pop $0
  ${NSD_CreateNumber} 62u 106u 48u 13u ""
  Pop $DWServiceCodePart2Input
  SendMessage $DWServiceCodePart2Input ${EM_LIMITTEXT} 3 0
  ${NSD_OnChange} $DWServiceCodePart2Input dwServiceCodePart2Changed
  ${NSD_CreateLabel} 114u 107u 8u 13u "-"
  Pop $0
  ${NSD_CreateNumber} 124u 106u 48u 13u ""
  Pop $DWServiceCodePart3Input
  SendMessage $DWServiceCodePart3Input ${EM_LIMITTEXT} 3 0

  ${NSD_CreateLabel} 0 126u 100% 30u "Wpisz kod otrzymany od supportu. Kod zostanie zapisany w chronionej postaci i nie uruchomi instalacji DWAgent w tej wersji."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function dwServiceCodePart1Changed
  Pop $0
  ${NSD_GetText} $DWServiceCodePart1Input $1
  StrLen $2 $1
  ${If} $2 == 3
    SendMessage $HWNDPARENT ${WM_NEXTDLGCTL} $DWServiceCodePart2Input 1
  ${EndIf}
FunctionEnd

Function dwServiceCodePart2Changed
  Pop $0
  ${NSD_GetText} $DWServiceCodePart2Input $1
  StrLen $2 $1
  ${If} $2 == 3
    SendMessage $HWNDPARENT ${WM_NEXTDLGCTL} $DWServiceCodePart3Input 1
  ${EndIf}
FunctionEnd

Function dwServiceConsentPageLeave
  ${NSD_GetState} $DWServiceConsentCheckbox $0
  ${If} $0 != ${BST_CHECKED}
    MessageBox MB_ICONEXCLAMATION|MB_OK "Zgoda na instalację i użycie DWService jest wymagana, aby kontynuować instalację i-JANEK."
    Abort
  ${EndIf}

  ${NSD_GetText} $DWServiceCodePart1Input $1
  ${NSD_GetText} $DWServiceCodePart2Input $2
  ${NSD_GetText} $DWServiceCodePart3Input $3
  StrCpy $DWServiceInstallationCode "$1-$2-$3"
  StrCmp $DWServiceInstallationCode "${DW_SERVICE_REQUIRED_INSTALLATION_CODE}" code_valid code_invalid

  code_invalid:
    MessageBox MB_ICONEXCLAMATION|MB_OK "Kod instalacyjny DWService jest wymagany i musi być zgodny z kodem przekazanym przez support."
    Abort

  code_valid:
    StrCpy $DWServiceConsentAccepted "true"
FunctionEnd
!endif

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
  ${if} $DWServiceExistingInstall == "true"
    ExecWait '"$1" -ExecutionPolicy Bypass -NoProfile -NonInteractive -File "$INSTDIR\resources\resources\scripts\install.ps1" -InstallDir "$INSTDIR" -IsUpdate' $0
  ${else}
    ExecWait '"$1" -ExecutionPolicy Bypass -NoProfile -NonInteractive -File "$INSTDIR\resources\resources\scripts\install.ps1" -InstallDir "$INSTDIR" -DwServiceConsentAccepted "$DWServiceConsentAccepted" -DwServiceInstallationCode "$DWServiceInstallationCode"' $0
  ${endif}
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
