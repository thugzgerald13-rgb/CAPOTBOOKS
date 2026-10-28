# CAPOTBOOKS optional Windows launcher for the locally installed BIR eBIRForms app.
# Run from the extracted integrations/ebirforms/windows folder in PowerShell.
$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:LOCALAPPDATA 'CAPOTBOOKS\eBIRFormsLauncher'
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
$launcherSource = Join-Path $PSScriptRoot 'Launch-CAPOTBOOKS-eBIRForms.ps1'
if (-not (Test-Path $launcherSource)) { throw "Launcher file not found: $launcherSource" }
$launcherTarget = Join-Path $installDir 'Launch-CAPOTBOOKS-eBIRForms.ps1'
Copy-Item -LiteralPath $launcherSource -Destination $launcherTarget -Force
$protocolKey = 'HKCU:\Software\Classes\capotbooks-ebirforms'
New-Item -Path $protocolKey -Force | Out-Null
Set-Item -Path $protocolKey -Value 'URL:CAPOTBOOKS eBIRForms Launcher'
New-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$protocolKey\shell\open\command" -Force | Out-Null
$psExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$command = '"{0}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{1}" "%1"' -f $psExe, $launcherTarget
Set-Item -Path "$protocolKey\shell\open\command" -Value $command
Write-Host 'CAPOTBOOKS eBIRForms launcher registered for this Windows user.' -ForegroundColor Green
Write-Host 'Return to CAPOTBOOKS and click Open eBIRForms. The browser may ask you to confirm opening an external app.'
