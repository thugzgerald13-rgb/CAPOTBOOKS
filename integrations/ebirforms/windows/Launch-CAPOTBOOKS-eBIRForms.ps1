# Protocol handler: launches the locally installed eBIRForms app only.
# It deliberately ignores URL parameters and does not read or transmit taxpayer data.
$ErrorActionPreference = 'Stop'
$base = Join-Path $env:LOCALAPPDATA 'CAPOTBOOKS\eBIRFormsLauncher'
$config = Join-Path $base 'app-path.txt'
$appPath = if (Test-Path $config) { (Get-Content -LiteralPath $config -Raw).Trim() } else { '' }

if (-not ($appPath -and (Test-Path -LiteralPath $appPath -PathType Leaf))) {
  $candidates = @(
    "$env:ProgramFiles\BIR eBIRForms\eBIRForms.exe",
    "${env:ProgramFiles(x86)}\BIR eBIRForms\eBIRForms.exe",
    "$env:ProgramFiles\eBIRForms\eBIRForms.exe",
    "${env:ProgramFiles(x86)}\eBIRForms\eBIRForms.exe",
    "$env:LOCALAPPDATA\Programs\eBIRForms\eBIRForms.exe"
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
  if ($candidates.Count -gt 0) { $appPath = $candidates[0] }
}

if (-not ($appPath -and (Test-Path -LiteralPath $appPath -PathType Leaf))) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = 'Locate the installed BIR eBIRForms application'
  $dialog.Filter = 'eBIRForms application (eBIRForms.exe)|eBIRForms.exe|Applications (*.exe)|*.exe'
  $dialog.CheckFileExists = $true
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $appPath = $dialog.FileName }
  $dialog.Dispose()
}

if (-not ($appPath -and (Test-Path -LiteralPath $appPath -PathType Leaf))) {
  Start-Process 'https://www.bir.gov.ph/'
  exit 2
}

New-Item -ItemType Directory -Path $base -Force | Out-Null
Set-Content -LiteralPath $config -Value $appPath -Encoding UTF8
Start-Process -FilePath $appPath -WorkingDirectory (Split-Path -Parent $appPath)
