param([string]$SetupPath=(Join-Path (Split-Path -Parent $PSScriptRoot) 'SETUP_PRODUCTION_AND_BUILD.ps1'))
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
$script:checks=0
function Assert([bool]$ok,[string]$label) { if(-not $ok){throw "ASSERT: $label"};$script:checks++ }
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($SetupPath,[ref]$tokens,[ref]$errors)
Assert ($errors.Count -eq 0) 'Windows setup parses'
foreach($fn in $ast.FindAll({param($n)$n -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)){Invoke-Expression $fn.Extent.Text}
$Root=Join-Path ([IO.Path]::GetTempPath()) ('GreetSync database selection '+[guid]::NewGuid())
$ServiceName='wishflow-backend';$DatabaseService=''
$desired='postgresql://postgres:fixture-new@desired.example.invalid:48009/railway'
$old='postgresql://postgres:fixture-old@old.example.invalid:12215/railway'
$rotated='postgresql://postgres:fixture-rotated@desired.example.invalid:48009/railway'
$pin=[PSCustomObject]@{host='desired.example.invalid';port=48009;database='railway'}
$config=[PSCustomObject]@{databaseTarget=$pin}
$backend=[PSCustomObject]@{DATABASE_URL='postgresql://postgres:fixture-old@old.railway.internal:5432/railway';DATABASE_PUBLIC_URL=$old}
$project=[PSCustomObject]@{services=[PSCustomObject]@{edges=@(
  [PSCustomObject]@{node=[PSCustomObject]@{id='old';name='OldPG'}},
  [PSCustomObject]@{node=[PSCustomObject]@{id='desired';name='DesiredPG'}}
)}}
function Get-ServiceVariables([string]$service) {
  if($service -eq 'OldPG') { return [PSCustomObject]@{POSTGRES_DB='railway';DATABASE_PUBLIC_URL=$old;DATABASE_URL=$backend.DATABASE_URL;GEMINI_API_KEY='fixture-old-ai'} }
  return [PSCustomObject]@{POSTGRES_DB='railway';DATABASE_PUBLIC_URL=$desired;DATABASE_URL='postgresql://postgres:fixture-new@desired.railway.internal:5432/railway';GEMINI_API_KEY='fixture-desired-ai'}
}
try {
  $null=New-Item -ItemType Directory -Path $Root -Force
  $envPath=Join-Path $Root '.env';$privatePath=Join-Path $Root 'GREETSYNC_DATABASE.local.env'
  Set-Content $envPath ('DATABASE_URL="'+$old+'"'+"`n"+'CUSTOM_KEEP="existing-setting"')
  Set-Content $privatePath ('DATABASE_URL="'+$desired+'"')
  $s=Select-DatabaseConfiguration $project $backend '' $config
  Assert ($s.LocalUrl -eq $desired -and $s.ServerUrl -eq $desired) 'Private owner configuration replaces the wrong database for both migration and deployment'
  Assert ($s.Database.Name -eq 'DesiredPG') 'Related variables come only from the selected database'
  $target=Get-DatabaseTargetValues $s.ServerUrl
  Assert ($target.DATABASE_TARGET_HOST -eq 'desired.example.invalid' -and $target.DATABASE_TARGET_PORT -eq '48009' -and $target.DATABASE_TARGET_NAME -eq 'railway') 'Runtime pin matches the actual selected URL'
  Write-EnvUpdates @{DATABASE_URL=$s.LocalUrl}
  Assert ((Read-ExistingEnvValue 'DATABASE_URL') -eq $desired) 'Correct target is merged into .env'
  Assert ((Get-Content -Raw $envPath).Contains('existing-setting')) 'Other owner configuration survives'
  # Reruns must not fetch the old deployment URL back into the local file.
  $again=Select-DatabaseConfiguration $project $backend '' $config
  Assert ($again.LocalUrl -eq $desired -and $again.ServerUrl -eq $desired) 'Repeat run does not restore the old remote URL'
  Write-EnvUpdates @{DATABASE_URL=$rotated}
  $s=Select-DatabaseConfiguration $project $backend '' $config
  Assert ($s.LocalUrl -eq $rotated -and $s.ServerUrl -eq $rotated) 'Updated .env password wins over the bootstrap file'
  $s=Select-DatabaseConfiguration $project $backend $desired $config
  Assert ($s.LocalUrl -eq $desired) 'Explicit matching URL takes precedence'
  Remove-Item $privatePath
  $s=Select-DatabaseConfiguration $project $backend '' $config
  Assert ($s.LocalUrl -eq $rotated) '.env remains sufficient without a private bootstrap file'
  Set-Content $envPath 'CUSTOM_KEEP="existing-setting"'
  $s=Select-DatabaseConfiguration $project $backend '' $config
  Assert ($s.LocalUrl -eq $desired -and $s.Database.Name -eq 'DesiredPG') 'Pinned discovery ignores an old backend URL even when several databases exist'
  Assert ($s.ServerUrl -eq $desired) 'Pinned deployment keeps the requested public URL'
  foreach($url in @($old,'postgresql://postgres:fixture@desired.example.invalid:1/railway','postgresql://postgres:fixture@desired.example.invalid:48009/other','postgresql://postgres:fixture@desired.example.invalid:48009/railway?%68ost=old.example.invalid')) {
    $failed=$false
    try { $null=Select-DatabaseConfiguration $project $backend $url $config }
    catch { $failed=$true;Assert (-not $_.Exception.Message.Contains('fixture')) 'Failure message hides credentials' }
    Assert $failed 'Mismatched or overridden connection cannot silently fall back'
  }
  Set-Content $envPath ('DATABASE_URL="'+$old+'"')
  $failed=$false
  try {$null=Select-DatabaseConfiguration $project $backend '' $config}catch{$failed=$true}
  Assert $failed 'A wrong local target without owner bootstrap requires correction, not automatic switching'
  Set-Content $envPath 'DATABASE_URL=""'
  $empty=[PSCustomObject]@{services=[PSCustomObject]@{edges=@()}}
  $failed=$false
  try {$null=Select-DatabaseConfiguration $empty $backend '' $config}catch{$failed=$true}
  Assert $failed 'Missing target never falls back to the old deployment database'
  Assert (Test-SameDatabaseTarget $desired $rotated) 'Credential rotation preserves database identity'
  Assert (-not(Test-SameDatabaseTarget $desired $old)) 'Different TCP proxy identifies a different target'
} finally {if(Test-Path $Root){Remove-Item -LiteralPath $Root -Recurse -Force}}
Write-Host "ALL PASSED: $script:checks database selection assertions; synthetic credentials, no deployment or database mutation."
