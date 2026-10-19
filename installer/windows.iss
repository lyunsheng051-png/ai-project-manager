#ifndef AppVersion
  #define AppVersion "0.1.1"
#endif
#ifndef AppSource
  #define AppSource "..\release\AIProjectManager-win32-x64"
#endif
#ifndef OutputDirectory
  #define OutputDirectory "..\release"
#endif
#define AppName "AI Project Manager"
#define AppExeName "AIProjectManager.exe"

[Setup]
AppId={{E88EC276-CFE2-4708-A85A-7233EBD17B51}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=liuyunsheng
AppPublisherURL=https://github.com/lyunsheng051-png/ai-project-manager
AppSupportURL=https://github.com/lyunsheng051-png/ai-project-manager/issues
DefaultDirName={localappdata}\Programs\AI Project Manager
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
OutputDir={#OutputDirectory}
OutputBaseFilename=AIProjectManager-{#AppVersion}-Setup-x64
SetupIconFile=..\resources\icon.ico
UninstallDisplayIcon={app}\{#AppExeName}
LicenseFile=..\LICENSE
Compression=lzma2/ultra64
LZMAUseSeparateProcess=yes
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
AppCopyright=Copyright (c) 2026 liuyunsheng

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#AppSource}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"; AppUserModelID: "com.lyunsheng.aiprojectmanager"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon; AppUserModelID: "com.lyunsheng.aiprojectmanager"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
