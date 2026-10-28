# Removes the per-user CAPOTBOOKS custom protocol registration and handler.
$ErrorActionPreference = 'Stop'
Remove-Item -LiteralPath 'HKCU:\Software\Classes\capotbooks-ebirforms' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath 'HKCU:\Software\CAPOTBOOKS\eBIRForms' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'CAPOTBOOKS\eBIRForms') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'CAPOTBOOKS eBIRForms protocol registration removed for the current Windows user.'
