# One-time per-Windows-user setup for the CAPOTBOOKS browser button.
# Registers capotbooks-ebirforms:// and installs a hidden protocol handler.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$handlerSource = Join-Path $PSScriptRoot 'Open-CAPOTBOOKS-eBIRForms.ps1'
if (-not (Test-Path -LiteralPath $handlerSource -PathType Leaf)) {
  [System.Windows.Forms.MessageBox]::Show(
    "The protocol handler script is missing:`n$handlerSource`n`nExtract the complete CAPOTBOOKS integration folder and run this installer again.",
    'CAPOTBOOKS eBIRForms setup', 'OK', 'Error'
  ) | Out-Null
  exit 1
}

$targetDir = Join-Path $env:LOCALAPPDATA 'CAPOTBOOKS\eBIRForms'
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
$handlerPath = Join-Path $targetDir 'Open-CAPOTBOOKS-eBIRForms.ps1'
Copy-Item -LiteralPath $handlerSource -Destination $handlerPath -Force

# Find common install locations first; if not found, ask the user to choose the installed EXE once.
$candidatePaths = @()
if (${env:ProgramFiles(x86)}) {
  $candidatePaths += (Join-Path ${env:ProgramFiles(x86)} 'BIR\eBIRForms\eBIRForms.exe')
  $candidatePaths += (Join-Path ${env:ProgramFiles(x86)} 'eBIRForms\eBIRForms.exe')
}
if ($env:ProgramFiles) {
  $candidatePaths += (Join-Path $env:ProgramFiles 'BIR\eBIRForms\eBIRForms.exe')
  $candidatePaths += (Join-Path $env:ProgramFiles 'eBIRForms\eBIRForms.exe')
}
$candidates = $candidatePaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }

$exePath = $candidates | Select-Object -First 1
if (-not $exePath) {
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = 'Select the installed BIR eBIRForms application'
  $dialog.Filter = 'eBIRForms application (eBIRForms.exe)|eBIRForms.exe|Executable files (*.exe)|*.exe'
  $dialog.CheckFileExists = $true
  $dialog.Multiselect = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    [System.Windows.Forms.MessageBox]::Show('Setup was cancelled. CAPOTBOOKS has not registered the eBIRForms button.', 'CAPOTBOOKS eBIRForms setup', 'OK', 'Information') | Out-Null
    exit 1
  }
  $exePath = $dialog.FileName
}

if ([System.IO.Path]::GetFileName($exePath) -ine 'eBIRForms.exe') {
  $answer = [System.Windows.Forms.MessageBox]::Show(
    "The selected file is named '$([System.IO.Path]::GetFileName($exePath))'.`nContinue using this executable?",
    'Confirm eBIRForms application', 'YesNo', 'Warning'
  )
  if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) { exit 1 }
}

$configKey = 'HKCU:\Software\CAPOTBOOKS\eBIRForms'
New-Item -Path $configKey -Force | Out-Null
Set-ItemProperty -Path $configKey -Name 'ExecutablePath' -Value ([System.IO.Path]::GetFullPath($exePath)) -Type String

$protocolKey = 'HKCU:\Software\Classes\capotbooks-ebirforms'
$commandKey = Join-Path $protocolKey 'shell\open\command'
New-Item -Path $commandKey -Force | Out-Null
Set-Item -Path $protocolKey -Value 'URL:CAPOTBOOKS eBIRForms Protocol'
New-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
$command = '"{0}" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{1}" "%1"' -f (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'), $handlerPath
Set-Item -Path $commandKey -Value $command

[System.Windows.Forms.MessageBox]::Show(
  "Setup complete. CAPOTBOOKS can now request Windows to open eBIRForms directly from its Open Desktop eBIRForms button.`n`nApplication: $exePath`n`nYou do not need to run this setup again unless eBIRForms is moved or reinstalled.",
  'CAPOTBOOKS eBIRForms setup complete', 'OK', 'Information'
) | Out-Null
