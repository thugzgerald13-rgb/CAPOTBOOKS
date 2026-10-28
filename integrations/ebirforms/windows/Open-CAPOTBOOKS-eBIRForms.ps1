# Invoked automatically by Windows when a user clicks the CAPOTBOOKS website button.
# Do not run this script manually.
$ErrorActionPreference = 'Stop'

try {
  $uriText = [string]$args[0]
  $uri = [System.Uri]$uriText
  if ($uri.Scheme -ne 'capotbooks-ebirforms' -or $uri.Host -ne 'open') {
    exit 0
  }

  $configKey = 'HKCU:\Software\CAPOTBOOKS\eBIRForms'
  $exePath = (Get-ItemProperty -Path $configKey -Name 'ExecutablePath' -ErrorAction Stop).ExecutablePath
  if (-not $exePath -or -not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
      "CAPOTBOOKS could not find the installed eBIRForms application.`n`nPlease run Install-CAPOTBOOKS-eBIRFormsProtocol.ps1 again and select the current eBIRForms.exe location.",
      'eBIRForms not found', 'OK', 'Warning'
    ) | Out-Null
    exit 1
  }

  Start-Process -FilePath $exePath
} catch {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
      "CAPOTBOOKS could not open eBIRForms.`n`n$($_.Exception.Message)`n`nRun the one-time protocol setup again if eBIRForms was moved or reinstalled.",
      'Unable to open eBIRForms', 'OK', 'Error'
    ) | Out-Null
  } catch { }
  exit 1
}
