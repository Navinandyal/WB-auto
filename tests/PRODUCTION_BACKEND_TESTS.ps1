param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:checks = 0
function Assert([bool]$value, [string]$description) {
  if (-not $value) { throw "ASSERT: $description" }
  $script:checks++
}
$tokens = $null; $errors = $null
$setupPath = Join-Path $ProjectRoot 'SETUP_PRODUCTION_AND_BUILD.ps1'
$ast = [System.Management.Automation.Language.Parser]::ParseFile($setupPath, [ref]$tokens, [ref]$errors)
Assert ($errors.Count -eq 0) 'Setup parses'
foreach ($fn in $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst]}, $false)) {
  if ($fn.Name -in @('Get-Property','Wait-ForHealth','Save-MobileBackendDefault')) { Invoke-Expression $fn.Extent.Text }
}
$server = Get-Content -Raw (Join-Path $ProjectRoot 'server.ts')
$source = Get-Content -Raw $setupPath
Assert ($server.Contains("build: 'meta-connect-production-20261013-v2'") -and $source.Contains("else { 'meta-connect-production-20261013-v2' }")) 'Health and deployment checks use the same release identifier'

$script:polls = 0; $script:healthMode = 'old'
function Invoke-RestMethod {
  param($Uri, $Method, $TimeoutSec)
  $script:polls++
  if ($script:healthMode -eq 'throw') { throw 'network unavailable' }
  $build = if ($script:healthMode -eq 'new' -and $script:polls -gt 2) { 'meta-connect-production-20261013-v2' } else { 'previous-version' }
  return [PSCustomObject]@{status = 'ok'; build = $build}
}
function Start-Sleep { param($Seconds) }
$failed = $false
try { Wait-ForHealth 'https://fixture.example.invalid' -ExpectedBuild 'meta-connect-production-20261013-v2' } catch { $failed = $true }
Assert ($failed -and $script:polls -eq 40) 'A healthy old backend cannot pass the new-deployment check'
$script:polls = 0; $script:healthMode = 'new'
Wait-ForHealth 'https://fixture.example.invalid' -ExpectedBuild 'meta-connect-production-20261013-v2'
Assert ($script:polls -eq 3) 'Poll until the new build is actually serving'
$script:polls = 0; $script:healthMode = 'old'
Wait-ForHealth 'https://fixture.example.invalid'
Assert ($script:polls -eq 1) 'APK-only mode accepts the current healthy backend'
$script:polls = 0; $script:healthMode = 'throw'; $failed = $false
try { Wait-ForHealth 'https://fixture.example.invalid' } catch { $failed = $true }
Assert ($failed -and $script:polls -eq 40) 'Network failure prevents success'

$Root = Join-Path ([IO.Path]::GetTempPath()) ('GreetSync backend test ' + [guid]::NewGuid())
try {
  $config = [PSCustomObject]@{projectId = 'fixture-project'; backendUrl = 'https://old.example.invalid'; custom = 'keep-owner-setting'}
  Save-MobileBackendDefault 'https://new.example.invalid/' $config
  $defaultPath = Join-Path $Root 'mobile/lib/core/backend_defaults.dart'
  $configPath = Join-Path $Root 'GREETSYNC_DEPLOYMENT.json'
  $dart = [IO.File]::ReadAllText($defaultPath)
  $saved = Get-Content -Raw $configPath | ConvertFrom-Json
  Assert ($dart.Contains('"https://new.example.invalid"')) 'Plain Flutter default matches resolved public origin'
  Assert ($saved.backendUrl -eq 'https://new.example.invalid' -and $saved.projectId -eq 'fixture-project' -and $saved.custom -eq 'keep-owner-setting') 'Domain is cached while other configuration survives'
  foreach ($url in @('http://new.example.invalid','https://localhost','https://127.0.0.1','https://[::1]','https://db.railway.internal','https://new.example.invalid/path','https://new.example.invalid?secret=1','https://new.example.invalid#token','https://user:password@new.example.invalid')) {
    $failed = $false
    try { Save-MobileBackendDefault $url $config } catch { $failed = $true }
    Assert $failed "Reject invalid production origin: $url"
    Assert ([IO.File]::ReadAllText($defaultPath) -eq $dart) 'Rejected origin cannot overwrite the working Flutter default'
  }
} finally {
  if (Test-Path $Root) { Remove-Item -LiteralPath $Root -Recurse -Force }
}
Write-Host "ALL PASSED: $script:checks production backend assertions. Responses mocked; no deployment performed."
