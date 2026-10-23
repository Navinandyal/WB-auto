param(
  [Parameter(Mandatory=$true)][ValidateSet('Backend','Schema','Migrate','Apk')][string]$Action,
  [string]$BackendUrl=''
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=Split-Path -Parent $PSScriptRoot
Set-Location $root
function Native([string]$file,[string[]]$arguments) {
 $previous=$ErrorActionPreference
 try { $ErrorActionPreference='Continue'; & $file @arguments; $code=$LASTEXITCODE }
 finally { $ErrorActionPreference=$previous }
 if($code -ne 0){throw "$file failed with exit code $code. Read the output above."}
}
switch($Action) {
 'Backend' { Native npm.cmd @('run','lint'); Native npm.cmd @('run','build') }
 'Schema' { Native npm.cmd @('run','db:prepare-supabase') }
 'Migrate' { Native npm.cmd @('run','db:migrate') }
 'Apk' {
  $u=[Uri]$BackendUrl
  if($u.Scheme -ne 'https' -or $u.UserInfo -or $u.Query -or $u.Fragment -or $u.AbsolutePath -ne '/'){throw 'A production HTTPS origin is required before building.'}
  if(-not (Get-Command flutter -ErrorAction SilentlyContinue)){throw 'Install Flutter and add its bin directory to PATH.'}
  . (Join-Path $root 'ANDROID_APK_TOOLS.ps1')
  $apk=Join-Path $root 'mobile\build\app\outputs\flutter-apk\app-release.apk'
  if(Test-Path $apk){Remove-Item -LiteralPath $apk -Force}
  Push-Location (Join-Path $root 'mobile')
  try { Native flutter @('pub','get'); Native flutter @('build','apk','--release',"--dart-define=API_BASE_URL=$BackendUrl") }
  finally { Pop-Location }
  if(-not (Test-Path $apk)){throw 'Flutter did not create the release APK.'}
  Publish-GreetApk -ProjectRoot $root -ApkPath $apk -BackendUrl $BackendUrl
 }
}
