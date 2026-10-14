param([string]$ApkPath='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$projectRoot=$PSScriptRoot
. (Join-Path $projectRoot 'ANDROID_APK_TOOLS.ps1')
if (-not $ApkPath) {
  $ApkPath=Join-Path $projectRoot 'mobile/build/app/outputs/flutter-apk/app-release.apk'
}
if (-not (Test-Path -LiteralPath $ApkPath)) {
  throw 'No built APK was found. Run BUILD_APK_ONLY.cmd first or pass -ApkPath to an existing APK.'
}
$config=Get-Content -Raw (Join-Path $projectRoot 'GREETSYNC_DEPLOYMENT.json') | ConvertFrom-Json
Publish-GreetApk -ProjectRoot $projectRoot -ApkPath $ApkPath -BackendUrl ([string]$config.backendUrl)
Write-Host '[OK] Verified and published GreetSync-production.apk. No rebuild or Railway login was required.' -ForegroundColor Green
