# CAPOTBOOKS ↔ BIR eBIRForms (Chrome / Edge website)

## What this integration currently does

- Exports a CAPOTBOOKS-generated XML file using field IDs observed in the supplied eBIRForms v7.9.6.2 saved-return samples.
- Adds a first-pass field mapping for BIR Form 1702-RT (`frm1702RT` IDs and the v2018C filename version).
- Optionally opens the installed desktop application through a per-Windows-user custom protocol.

**Direct automatic import is not yet verified or enabled.** The launcher only opens the app; it does not receive the generated XML, import it, fill fields, or submit returns. The exact Windows application's XML-open behavior must be tested with an anonymized test return before adding automation.

## Install the launcher (Windows)

1. Extract the CAPOTBOOKS ZIP.
2. Open `integrations/ebirforms/windows`.
3. Right-click `Install-CAPOTBOOKS-eBIRFormsLauncher.ps1` and choose **Run with PowerShell**. If Windows policy blocks scripts, ask your administrator to review/run the script; do not lower the machine-wide execution policy.
4. Return to CAPOTBOOKS in Chrome or Edge and click **Open eBIRForms**. Approve the browser's external-app prompt. On first launch, if the launcher cannot find the app automatically, select the installed `eBIRForms.exe` in the file picker. The chosen path is saved under your Windows user profile for later launches.

The installer writes only under the current user's `HKCU\Software\Classes\capotbooks-ebirforms` registry key and `%LOCALAPPDATA%\CAPOTBOOKS\eBIRFormsLauncher`. It does not require administrator rights. The launcher does not receive taxpayer data from the browser URL.

## Controlled 1702-RT test

1. Use a **test client with anonymized identity data** and confirm its sales, purchases, and expenses totals before export.
2. In CAPOTBOOKS, select **1702RT**, choose the intended tax year, and click **Download XML**.
3. Open eBIRForms and use its supported **File → Open** workflow to select the generated XML. If the app rejects it, stop; do not try it on a live return.
4. Check that the form is identified as 1702-RT and that the TIN groups, return period, registered name, address, sales, cost, deductions, and tax amounts appear in the intended fields.
5. Record any validation errors and compare the opened values to the test data. Do not submit this test return.

## Known limitations

- The XML format is reverse-engineered from user-provided saved-return samples, not a published integration contract. This first pass is a **draft export**, not BIR-certified software.
- The current CAPOTBOOKS ledger interface provides aggregate purchase and expense totals rather than a complete tax schedule. For 1702-RT, the export places the aggregate itemized expense total in a review-required “Others” line. Tax credits, MCIT, NOLCO details, penalties, and several other schedules are not fully populated. Verify and correct all schedules in eBIRForms.
- No command-line XML-open argument or supported local import API has been confirmed in the supplied offline package. Do not claim that XML is automatically imported just because the app launches or the file downloads.
- The launcher cannot confirm whether a return was accepted or filed. Filing status must be confirmed through the official BIR process and acknowledgment.

## Uninstall

Remove the current user's `HKCU\Software\Classes\capotbooks-ebirforms` registry key and `%LOCALAPPDATA%\CAPOTBOOKS\eBIRFormsLauncher` folder, or use the uninstall instructions provided by your administrator.
