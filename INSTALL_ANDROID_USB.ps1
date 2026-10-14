param([string]$ApkPath='', [string]$DeviceSerial='')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = $PSScriptRoot
. (Join-Path $projectRoot 'ANDROID_APK_TOOLS.ps1')
if (-not $ApkPath) { $ApkPath = Join-Path $projectRoot 'GreetSync-production.apk' }
$diagnostic = Join-Path $projectRoot 'APK_INSTALL_DIAGNOSTIC.txt'
$log = [System.Collections.Generic.List[string]]::new()
$temporary = ''
try {
  $ApkPath = (Resolve-Path -LiteralPath $ApkPath).Path
  $tools = Get-GreetAndroidTools $projectRoot
  $new = Test-GreetApk $ApkPath $tools
  $log.Add("APK: $ApkPath")
  $log.Add("Bytes: $((Get-Item -LiteralPath $ApkPath).Length)")
  $log.Add("SHA256: $((Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash)")
  $log.Add("Version code: $($new.VersionCode); signer SHA256: $($new.Signers)")
  if (-not (Test-Path $tools.Adb)) { throw 'Install Android SDK Platform-Tools in Android Studio (adb is missing).' }
  $devices = Invoke-GreetAndroidTool $tools.Adb @('devices')
  if ($devices.ExitCode -ne 0) { throw "adb could not list devices. $($devices.Output)" }
  $ready = @([regex]::Matches($devices.Output, '(?m)^(\S+)\s+device\s*$') | ForEach-Object { $_.Groups[1].Value })
  if (-not $DeviceSerial) {
    if ($ready.Count -ne 1) { throw 'Connect exactly one phone, enable USB debugging and accept the authorization prompt. With several devices, pass -DeviceSerial SERIAL.' }
    $DeviceSerial = $ready[0]
  } elseif ($ready -notcontains $DeviceSerial) { throw 'The selected phone is not connected/authorized for USB debugging.' }
  $prefix = @('-s',$DeviceSerial)
  $sdk = Invoke-GreetAndroidTool $tools.Adb ($prefix + @('shell','getprop','ro.build.version.sdk'))
  $abi = Invoke-GreetAndroidTool $tools.Adb ($prefix + @('shell','getprop','ro.product.cpu.abilist'))
  $log.Add("Device API: $($sdk.Output.Trim()); ABIs: $($abi.Output.Trim())")
  $installed = Invoke-GreetAndroidTool $tools.Adb ($prefix + @('shell','pm','path',$new.Package))
  # PackageManager returns 1 with empty output when the package is absent.
  # That is a fresh installation, not an adb failure.
  if ($installed.ExitCode -ne 0 -and -not ($installed.ExitCode -eq 1 -and [string]::IsNullOrWhiteSpace($installed.Output))) {
    throw "Could not inspect installed app. $($installed.Output)"
  }
  if ($installed.Output -match '(?m)^package:(.+/base\.apk)\s*$') {
    $remote = $Matches[1].Trim()
    $temporary = Join-Path ([IO.Path]::GetTempPath()) ('GreetSync-install-'+[guid]::NewGuid())
    $null = New-Item -ItemType Directory -Path $temporary
    $base = Join-Path $temporary 'installed-base.apk'
    $pull = Invoke-GreetAndroidTool $tools.Adb ($prefix + @('pull',$remote,$base))
    if ($pull.ExitCode -ne 0) { throw 'Could not read the installed APK for the signing check. Keep the installed app and share this diagnostic.' }
    $old = Read-GreetApkMetadata $base $tools
    $log.Add("Installed version code: $($old.VersionCode); signer SHA256: $($old.Signers)")
    Assert-GreetApkUpdate $new $old
  } elseif ($installed.Output -match '(?m)^package:') {
    throw 'Installed APK path is not a recognized base APK. Keep the installed app and share this diagnostic.'
  }
  # Updating with -r retains app data. Never use uninstall or downgrade flags.
  $result = Invoke-GreetAndroidTool $tools.Adb ($prefix + @('install','-r',$ApkPath))
  $log.Add($result.Output)
  if ($result.ExitCode -ne 0 -or $result.Output -notmatch '(?m)^Success\s*$') {
    throw (Get-GreetInstallAdvice $result.Output)
  }
  Write-Host '[OK] GreetSync installed. Existing app data was retained.' -ForegroundColor Green
} catch {
  $log.Add($_.Exception.Message)
  Write-Host $_.Exception.Message -ForegroundColor Red
  throw
} finally {
  $log | Set-Content -Encoding UTF8 $diagnostic
  if ($temporary -and (Test-Path $temporary)) { Remove-Item -LiteralPath $temporary -Recurse -Force }
  Write-Host "Diagnostic saved: $diagnostic"
}
