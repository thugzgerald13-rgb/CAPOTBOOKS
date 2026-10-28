# CAPOTBOOKS — open installed offline eBIRForms from Chrome/Edge

This adds a **one-time per-Windows-user protocol registration**. After setup, the user can click **Open Desktop eBIRForms** inside CAPOTBOOKS. Chrome/Edge may display its normal external-application confirmation the first time or according to browser policy; accepting it asks Windows to launch the installed eBIRForms application. The user does not need to open a launcher manually on each use.

## One-time setup

1. Extract the complete CAPOTBOOKS project ZIP.
2. On the Windows computer that has eBIRForms installed, open this folder: `integrations/ebirforms/windows`.
3. Right-click `Install-CAPOTBOOKS-eBIRFormsProtocol.ps1` and choose **Run with PowerShell**. If that option is unavailable, open PowerShell, change directory to this folder, and run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-CAPOTBOOKS-eBIRFormsProtocol.ps1
   ```

4. If the installer does not find eBIRForms in a common location, select the installed `eBIRForms.exe` in the file picker.
5. Return to CAPOTBOOKS in Chrome/Edge and click **Open Desktop eBIRForms**. Approve the browser's external-app prompt if shown.

The registration is stored under the current Windows user's `HKCU` registry, so administrator rights should not be required. The handler script is copied to `%LOCALAPPDATA%\CAPOTBOOKS\eBIRForms` and runs invisibly; it only accepts the `capotbooks-ebirforms://open` URI and launches the executable path selected during setup.

## If eBIRForms is moved or updated

Run the installer again and select the new executable path if asked.

## Uninstall

Run `Uninstall-CAPOTBOOKS-eBIRFormsProtocol.ps1` from this folder. This removes only the current Windows user's CAPOTBOOKS protocol registration and copied handler; it does not uninstall eBIRForms.

## Limitations

- A normal website cannot launch arbitrary local executables without a user-installed protocol handler or a desktop wrapper. This integration uses Windows' registered custom protocol.
- The browser may show a confirmation prompt. That is controlled by the browser and cannot be suppressed reliably by a website.
- This only opens eBIRForms. It does not automatically import the XML, populate the official form, validate a return, or submit it. Those steps must be confirmed against the supported behavior of the installed BIR package.
- This installer is a PowerShell script supplied as source. Review it before running it, and distribute it only through your trusted CAPOTBOOKS deployment channel.
