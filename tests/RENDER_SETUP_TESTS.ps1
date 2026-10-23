param([string]$ProjectRoot=(Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
foreach($file in @('SETUP_PRODUCTION_AND_BUILD.ps1','tools/production-native.ps1')){
 $tokens=$null;$errors=$null
 [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $ProjectRoot $file),[ref]$tokens,[ref]$errors)
 if($errors.Count){throw "$file contains PowerShell syntax errors: $errors"}
 Write-Host "PASS: $file parses"
}
Write-Host 'PowerShell syntax passed. Behavioral deployment tests are in render-deployment.test.ts; Android signing/install fixtures are in ANDROID_APK_TESTS.ps1.'
