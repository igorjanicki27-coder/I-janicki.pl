!include "x64.nsh"
!include "MUI2.nsh"
!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER
Var DWServiceConsentCheckbox
Var DWServiceCodeInput
Var DWServiceConsentAccepted
Var DWServiceInstallationCode
Var DWServiceExistingInstall

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

  ${NSD_CreateLabel} 0 88u 100% 14u "Kod instalacyjny DWService (opcjonalnie na tym etapie)"
  Pop $0
  ${NSD_CreateText} 0 106u 55% 13u "$DWServiceInstallationCode"
  Pop $DWServiceCodeInput
  SendMessage $DWServiceCodeInput ${EM_LIMITTEXT} 11 0

  ${NSD_CreateLabel} 0 126u 100% 30u "Format: 123-456-789. Kod zostanie zapisany w chronionej postaci i nie uruchomi instalacji DWAgent w tej wersji."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function dwServiceConsentPageLeave
  ${NSD_GetState} $DWServiceConsentCheckbox $0
  ${If} $0 != ${BST_CHECKED}
    MessageBox MB_ICONEXCLAMATION|MB_OK "Zgoda na instalację i użycie DWService jest wymagana, aby kontynuować instalację i-JANEK."
    Abort
  ${EndIf}

  ${NSD_GetText} $DWServiceCodeInput $DWServiceInstallationCode
  StrLen $1 $DWServiceInstallationCode
  StrCmp $1 0 code_valid
  StrCmp $1 11 validate_code code_invalid

  validate_code:
    StrCpy $2 0
  code_loop:
    IntCmp $2 11 code_valid
    StrCpy $0 $DWServiceInstallationCode 1 $2
    IntCmp $2 3 code_hyphen
    IntCmp $2 7 code_hyphen
    StrCmp $0 "0" code_next
    StrCmp $0 "1" code_next
    StrCmp $0 "2" code_next
    StrCmp $0 "3" code_next
    StrCmp $0 "4" code_next
    StrCmp $0 "5" code_next
    StrCmp $0 "6" code_next
    StrCmp $0 "7" code_next
    StrCmp $0 "8" code_next
    StrCmp $0 "9" code_next code_invalid
  code_hyphen:
    StrCmp $0 "-" code_next code_invalid
  code_next:
    IntOp $2 $2 + 1
    Goto code_loop

  code_invalid:
    MessageBox MB_ICONEXCLAMATION|MB_OK "Kod instalacyjny DWService musi mieć format 123-456-789 albo pozostać pusty."
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
