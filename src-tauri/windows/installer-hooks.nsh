; Registers Leafdown as a candidate handler for its Markdown file extensions without claiming the
; default: the `.ext` default value and the user's choice are never written. Defines from the Tauri
; template are referenced only inside macros, because this file is included before they exist.

!include "${__FILEDIR__}\..\gen\windows\markdown-file-extensions.nsh"

!define LEAFDOWN_PROGID "Leafdown.Markdown"
!define LEAFDOWN_PROGID_KEY "Software\Classes\Leafdown.Markdown"

!macro LEAFDOWN_OPEN_COMMAND OUTPUT
  StrCpy ${OUTPUT} `"$INSTDIR\${MAINBINARYNAME}.exe" "%1"`
!macroend

!macro LEAFDOWN_REGISTER_EXTENSION EXTENSION
  WriteRegNone SHCTX "Software\Classes\.${EXTENSION}\OpenWithProgids" "${LEAFDOWN_PROGID}"
  WriteRegStr SHCTX "${MANUPRODUCTKEY}\Capabilities\FileAssociations" ".${EXTENSION}" "${LEAFDOWN_PROGID}"
!macroend

!macro LEAFDOWN_UNREGISTER_EXTENSION EXTENSION
  DeleteRegValue SHCTX "Software\Classes\.${EXTENSION}\OpenWithProgids" "${LEAFDOWN_PROGID}"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXTENSION}\OpenWithProgids"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro LEAFDOWN_OPEN_COMMAND $R0
  WriteRegStr SHCTX "${LEAFDOWN_PROGID_KEY}" "" "Markdown Document"
  WriteRegStr SHCTX "${LEAFDOWN_PROGID_KEY}\DefaultIcon" "" `"$INSTDIR\${MAINBINARYNAME}.exe",0`
  WriteRegStr SHCTX "${LEAFDOWN_PROGID_KEY}\shell\open\command" "" $R0

  WriteRegStr SHCTX "${MANUPRODUCTKEY}\Capabilities" "ApplicationName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${MANUPRODUCTKEY}\Capabilities" "ApplicationDescription" "A local-first Markdown editor for ordinary files and folders"
  !insertmacro LEAFDOWN_FOR_EACH_MARKDOWN_FILE_EXTENSION LEAFDOWN_REGISTER_EXTENSION
  WriteRegStr SHCTX "Software\RegisteredApplications" "${PRODUCTNAME}" "${MANUPRODUCTKEY}\Capabilities"

  !insertmacro UPDATEFILEASSOC
!macroend

; Another installation location may have registered since this one did, so only a registration
; whose command still names this installation's executable is removed.
!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro LEAFDOWN_OPEN_COMMAND $R0
  ReadRegStr $R1 SHCTX "${LEAFDOWN_PROGID_KEY}\shell\open\command" ""
  ${If} $R1 == $R0
    !insertmacro LEAFDOWN_FOR_EACH_MARKDOWN_FILE_EXTENSION LEAFDOWN_UNREGISTER_EXTENSION
    DeleteRegValue SHCTX "Software\RegisteredApplications" "${PRODUCTNAME}"
    DeleteRegKey SHCTX "${MANUPRODUCTKEY}\Capabilities"
    DeleteRegKey SHCTX "${LEAFDOWN_PROGID_KEY}"

    !insertmacro UPDATEFILEASSOC
  ${EndIf}
!macroend
