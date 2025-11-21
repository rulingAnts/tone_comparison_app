; Custom NSIS installer script for Tone Matching Bundler
; Handles cleanup with user confirmation

!macro customInit
  ; Check if a previous version exists BEFORE installation starts
  IfFileExists "$INSTDIR\Tone Matching Bundler.exe" show_warning no_previous_install
  
  show_warning:
    MessageBox MB_YESNO|MB_ICONEXCLAMATION \
      "A previous installation of Tone Matching Bundler was detected.$\n$\n\
      IMPORTANT: Installing this version will remove all application data, including any in-progress bundles.$\n$\n\
      Please export any work in progress before continuing.$\n$\n\
      Do you want to continue with the installation?" \
      IDYES continue_install IDNO abort_install
  
  abort_install:
    ; User clicked No - abort installation
    Abort "Installation cancelled by user. Please export your data and run the installer again."
  
  continue_install:
  no_previous_install:
  ; Clean up AppData BEFORE installation (but leave $INSTDIR alone - NSIS handles that)
  RMDir /r "$LOCALAPPDATA\Tone Matching Bundler"
  RMDir /r "$LOCALAPPDATA\tone-matching-bundler"
  RMDir /r "$APPDATA\Tone Matching Bundler"
  RMDir /r "$APPDATA\tone-matching-bundler"
  RMDir /r "$TEMP\Tone Matching Bundler"
!macroend

!macro customUnInstall
  ; Warn user about data loss on uninstall
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to remove all application data?$\n$\n\
    This will delete any saved bundles and settings.$\n$\n\
    Click YES to remove all data, or NO to keep your data for future installations." \
    IDYES remove_data IDNO skip_data_removal
  
  remove_data:
  ; Clean up file associations
  DeleteRegKey HKCU "Software\Classes\.tnbundle"
  DeleteRegKey HKCU "Software\Classes\ToneBundle"
  
  ; Clean up AppData on uninstall
  RMDir /r "$LOCALAPPDATA\Tone Matching Bundler"
  RMDir /r "$LOCALAPPDATA\tone-matching-bundler"
  RMDir /r "$APPDATA\Tone Matching Bundler"
  RMDir /r "$APPDATA\tone-matching-bundler"
  
  skip_data_removal:
  ; Program files are always removed
!macroend
