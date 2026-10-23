param([string]$SetupPath=(Join-Path (Split-Path -Parent $PSScriptRoot) 'SETUP_PRODUCTION_AND_BUILD.ps1'))
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$script:count=0
function Assert([bool]$condition,[string]$text) { if(-not $condition){throw "ASSERT: $text"};$script:count++ }
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($SetupPath,[ref]$tokens,[ref]$errors)
Assert ($errors.Count -eq 0) 'Setup parses'
$commands=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.CommandAst]},$true))
Assert (@($commands|Where-Object {$_.GetCommandName() -eq 'Read-Host'}).Count -eq 0) 'No Read-Host account/database prompts'
$source=Get-Content -Raw $SetupPath
foreach($fn in $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)){Invoke-Expression $fn.Extent.Text}
Assert (-not (Test-PublicPostgresUrl 'postgresql://${{PGUSER}}:${{PGPASSWORD}}@${{HOST}}/db')) 'Reject unresolved screenshot references'
Assert (-not (Test-PublicPostgresUrl 'postgresql://user:fixture@db.railway.internal:5432/db')) 'Private URL is not a Windows migration URL'
Assert (Test-PublicPostgresUrl 'postgresql://user:fixture@proxy.example.invalid:1234/db') 'Public database URL accepted'
$reconstructed=Get-PublicDatabaseUrl ([PSCustomObject]@{RAILWAY_TCP_PROXY_DOMAIN='proxy.example.invalid';RAILWAY_TCP_PROXY_PORT='1234';POSTGRES_USER='user';POSTGRES_PASSWORD='p@ss/word';POSTGRES_DB='database'})
Assert ($reconstructed -match 'p%40ss%2Fword') 'Proxy reconstruction encodes password safely'
Assert ((Get-LinkedId ([PSCustomObject]@{projectId='fixture'}) 'projectId' 'project_id') -eq 'fixture') 'CamelCase link format'
Assert ((Get-LinkedId ([PSCustomObject]@{project_id='fixture'}) 'projectId' 'project_id') -eq 'fixture') 'Underscore link alias'
function Read-Host { throw 'A setup prompt was opened' }
$script:mockProjectId='e1297f67-4f5b-4159-be56-73178b459d60';$script:mockEnvironmentId='d52cfe49-1c90-4449-9582-b853e74706f0'
$script:scenario='';$script:events=[System.Collections.Generic.List[string]]::new();$script:fixture=''
$script:serverPrivate='postgresql://postgres:fixture-password@db.railway.internal:5432/railway'
$script:public='postgresql://postgres:fixture-password@proxy.example.invalid:12345/railway'
function Fake-Railway {
 $a=@($args);$script:events.Add('railway:'+($a -join ' '));$global:LASTEXITCODE=0
 switch($a[0]) {
  'whoami' { if($script:scenario -in @('expired-login','token-auth')){$global:LASTEXITCODE=1;return};'{"email":"fixture@example.invalid"}' }
  'link' {
   if($script:scenario -eq 'link-failure'){$global:LASTEXITCODE=1;return}
   if($a -notcontains '--project' -or $a -notcontains '--environment') {throw 'Bare interactive link attempted'}
   $id=$a[[Array]::IndexOf($a,'--project')+1];$envId=$a[[Array]::IndexOf($a,'--environment')+1]
   if($script:scenario -eq 'wrong-link'){$id='wrong-project'}
   if($script:scenario -eq 'underscore-link'){@{project_id=$id;environment_id=$envId}|ConvertTo-Json -Compress}
   else {@{projectId=$id;environmentId=$envId}|ConvertTo-Json -Compress}
  }
  'status' {
   $id=$script:mockProjectId
   if($script:scenario -eq 'wrong-status'){$id='wrong-project'}
   $services=@(@{node=@{id='backend';name='wishflow-backend'}},@{node=@{id='db1';name='Postgres'}})
   if($script:scenario -in @('multiple-databases','named-database')) {$services+=@{node=@{id='db2';name='Postgres2'}}}
   @{id=$id;services=@{edges=$services}}|ConvertTo-Json -Depth 7 -Compress
  }
  'service' { if($script:scenario -eq 'new-backend'){$global:LASTEXITCODE=1} }
  'add' { 'Service created' }
  'variable' {
   if($a[1] -eq 'set'){ 'Variable updated';return }
   $service=$a[[Array]::IndexOf($a,'--service')+1]
   if($script:scenario -eq 'variable-failure'){$global:LASTEXITCODE=1;'private-captured-error';return}
   if($service -eq 'wishflow-backend') {
    if($script:scenario -eq 'new-backend') {'{}';return}
    $url=$script:serverPrivate
    if($script:scenario -in @('multiple-databases','named-database')){$url=''}
    if($script:scenario -eq 'backend-public'){$url=$script:public}
    $values=@{DATABASE_URL=$url;AUTH_TOKEN_SECRET='remote-auth';CREDENTIAL_ENCRYPTION_KEY='remote-encryption';META_WEBHOOK_VERIFY_TOKEN='existing-verify-token'}
    if($script:scenario -eq 'sealed-secrets'){$values['AUTH_TOKEN_SECRET']=$null;$values['CREDENTIAL_ENCRYPTION_KEY']=$null;$values['META_WEBHOOK_VERIFY_TOKEN']=$null;$values['GEMINI_API_KEY']=$null}
    $values|ConvertTo-Json -Compress
   } else {
    $url=$script:public
    if($script:scenario -in @('raw-references','missing-public')){$url='postgresql://${{PGUSER}}:${{PGPASSWORD}}@${{HOST}}/db'}
    @{POSTGRES_DB='railway';DATABASE_PUBLIC_URL=$url;DATABASE_URL=$script:serverPrivate;GEMINI_API_KEY='fixture-ai-key'}|ConvertTo-Json -Compress
   }
  }
  'domain' { '{"domain":"configured-backend.up.railway.app"}' }
  'up' {
   $script:deployAttempts++
   if ($script:scenario -eq 'paused-permanent' -or ($script:scenario -eq 'paused-recovers' -and $script:deployAttempts -lt 3)) {
    $global:LASTEXITCODE=1; 'Deploys have been paused temporarily';return
   }
   if ($script:scenario -eq 'deploy-unknown') { $global:LASTEXITCODE=1;'Connection reset after upload';return }
   if ($script:scenario -eq 'paused-after-accepted') { $global:LASTEXITCODE=1;'Build Logs: https://fixture.example.invalid/build/1';'Deploys have been paused temporarily';return }
   'Mock deploy complete'
  }
  'login' {throw 'Unexpected normal-run login'}
  'logout' {throw 'Unexpected logout'}
  default {throw "Unexpected CLI command $($a[0])"}
 }
}
function Start-Sleep { param([int]$Seconds) $script:events.Add("wait:$Seconds") }
function npm {
 $script:events.Add('npm:'+($args -join ' '));$global:LASTEXITCODE=0
 if($args -contains 'db:migrate') {
  if($env:DATABASE_URL -ne $script:public){throw 'Wrong child migration URL'}
  if($script:scenario -eq 'migration-failure'){$global:LASTEXITCODE=2}
 }
}
function flutter {
 $script:events.Add('flutter:'+($args -join ' '));$global:LASTEXITCODE=0
 if($args -contains 'apk') {
  if($script:scenario -eq 'apk-failure'){$global:LASTEXITCODE=3;return}
  if($script:scenario -eq 'apk-stale'){return}
  $dir=Join-Path $script:fixture 'mobile/build/app/outputs/flutter-apk';New-Item -ItemType Directory -Path $dir -Force|Out-Null
  Set-Content (Join-Path $dir 'app-release.apk') 'test-fixture-not-an-apk'
 }
}
$edits=@()
foreach($fn in $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)) {
 $replacement=$null
 switch($fn.Name) {
  'Resolve-RailwayExecutable' {$replacement="function Resolve-RailwayExecutable { return 'Fake-Railway' }"}
  'Need-Command' {$replacement='function Need-Command($name,$hint) {}'}
  'Wait-ForHealth' {$replacement='function Wait-ForHealth([string]$url,[string]$ExpectedBuild="") { $script:events.Add("health:"+$url); $script:events.Add("expected-build:"+$ExpectedBuild) }'}
 }
 if($replacement){$edits+=@{Start=$fn.Extent.StartOffset;End=$fn.Extent.EndOffset;Text=$replacement}}
}
foreach($edit in ($edits|Sort-Object Start -Descending)) {$source=$source.Substring(0,$edit.Start)+$edit.Text+$source.Substring($edit.End)}
$initial=Get-Location;$tmp=Join-Path ([IO.Path]::GetTempPath()) ('GreetSync no prompts spaces '+[guid]::NewGuid())
$before=@{}
foreach($key in @('DATABASE_URL','AUTH_TOKEN_SECRET','RAILWAY_TOKEN','RAILWAY_API_TOKEN')){$before[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
try {
 foreach($case in @(
  @{Name='paused-recovers';Ok=$true},@{Name='paused-permanent';Ok=$false},@{Name='deploy-unknown';Ok=$false},@{Name='paused-after-accepted';Ok=$false},
  @{Name='local-db-wins';Ok=$true},@{Name='private-file-pins';Ok=$true},@{Name='sealed-secrets';Ok=$true},@{Name='normal';Ok=$true},@{Name='repeat-run';Ok=$true},@{Name='token-auth';Ok=$true},
  @{Name='underscore-link';Ok=$true},@{Name='new-backend';Ok=$true},@{Name='backend-public';Ok=$true},
  @{Name='named-database';Ok=$true},@{Name='skip-deploy';Ok=$true},@{Name='skip-apk';Ok=$true},
  @{Name='expired-login';Ok=$false},@{Name='link-failure';Ok=$false},@{Name='wrong-link';Ok=$false},
  @{Name='wrong-status';Ok=$false},@{Name='variable-failure';Ok=$false},@{Name='raw-references';Ok=$false},
  @{Name='missing-public';Ok=$false},@{Name='multiple-databases';Ok=$false},
  @{Name='migration-failure';Ok=$false},@{Name='apk-failure';Ok=$false},@{Name='both-tokens';Ok=$false},
  @{Name='apk-invalid';Ok=$false},@{Name='apk-stale';Ok=$false},@{Name='apk-changed-signing';Ok=$false}
 )) {
  $script:deployAttempts=0
  $script:scenario=$case.Name;$script:events=[System.Collections.Generic.List[string]]::new()
  $script:fixture=Join-Path $tmp $case.Name;New-Item -ItemType Directory -Path (Join-Path $script:fixture 'mobile') -Force|Out-Null
  Set-Content (Join-Path $script:fixture 'package.json') '{}';Set-Content (Join-Path $script:fixture 'mobile/pubspec.yaml') 'name: fixture'
  $dbName=if($case.Name -eq 'named-database'){'Postgres'}else{''}
  @{projectId=$script:mockProjectId;environmentId=$script:mockEnvironmentId;backendService='wishflow-backend';databaseService=$dbName;backendUrl='https://configured-backend.up.railway.app'}|ConvertTo-Json|Set-Content (Join-Path $script:fixture 'GREETSYNC_DEPLOYMENT.json')
  Set-Content (Join-Path $script:fixture '.env') @'
DATABASE_URL=""
AUTH_TOKEN_SECRET="stale-local-auth"
CREDENTIAL_ENCRYPTION_KEY="stale-local-encryption"
FIREBASE_SERVICE_ACCOUNT_JSON='{"fixture":true}'
CUSTOM_KEEP="owner-extra-setting"
'@
  if($case.Name -eq 'local-db-wins') {
   $envPath=Join-Path $script:fixture '.env'
   (Get-Content -Raw $envPath).Replace('DATABASE_URL=""','DATABASE_URL="'+$script:public+'"') | Set-Content $envPath
  }
  if($case.Name -eq 'private-file-pins') {
   Set-Content (Join-Path $script:fixture 'GREETSYNC_DATABASE.local.env') ('DATABASE_URL="'+$script:public+'"')
  }
  # Real publishing/copy/pin logic with mocked APK metadata. Native Android
  # validation is exercised separately by ANDROID_APK_TESTS.ps1.
  $helper=Get-Content -Raw (Join-Path (Split-Path -Parent $SetupPath) 'ANDROID_APK_TOOLS.ps1')
  $helper += @'

function Get-GreetAndroidTools([string]$ProjectRoot) { return [PSCustomObject]@{} }
function Read-GreetApkMetadata([string]$ApkPath,$Tools) { return [PSCustomObject]@{Package='com.aikyam.whatsappautomation';VersionCode=4;VersionName='1.0.3';Signers=('a'*64)} }
function Test-GreetApk([string]$ApkPath,$Tools) {
 if ($script:scenario -eq 'apk-invalid') { throw 'Fixture APK rejected by validator' }
 return Read-GreetApkMetadata $ApkPath $Tools
}
'@
  Set-Content (Join-Path $script:fixture 'ANDROID_APK_TOOLS.ps1') $helper
  if($case.Name -in @('apk-stale','apk-changed-signing','apk-invalid')) {
   Set-Content (Join-Path $script:fixture 'GreetSync-production.apk') 'previous-apk-retained'
   $dir=Join-Path $script:fixture 'mobile/build/app/outputs/flutter-apk';New-Item -ItemType Directory -Path $dir -Force|Out-Null
   Set-Content (Join-Path $dir 'app-release.apk') 'stale-generated-output'
  }
  if($case.Name -eq 'apk-changed-signing') {
   $dir=Join-Path $script:fixture '.android-signing';New-Item -ItemType Directory -Path $dir -Force|Out-Null
   @{Signers=('b'*64);VersionCode=4}|ConvertTo-Json|Set-Content (Join-Path $dir 'identity.json')
  }
  $file=Join-Path $script:fixture 'SETUP_PRODUCTION_AND_BUILD.ps1';Set-Content $file $source -Encoding utf8BOM
  [Environment]::SetEnvironmentVariable('DATABASE_URL','old-process-value','Process')
  [Environment]::SetEnvironmentVariable('AUTH_TOKEN_SECRET','old-process-auth','Process')
  [Environment]::SetEnvironmentVariable('RAILWAY_TOKEN',$null,'Process');[Environment]::SetEnvironmentVariable('RAILWAY_API_TOKEN',$null,'Process')
  if($case.Name -eq 'sealed-secrets'){Assert (@($events|Where-Object {$_ -match 'variable set (AUTH_TOKEN_SECRET|CREDENTIAL_ENCRYPTION_KEY|GEMINI_API_KEY|META_WEBHOOK_VERIFY_TOKEN)='}).Count -eq 0) 'Never overwrite sealed remote secrets'}
  if($case.Name -eq 'token-auth'){[Environment]::SetEnvironmentVariable('RAILWAY_TOKEN','fixture-project-token','Process')}
  if($case.Name -eq 'both-tokens'){[Environment]::SetEnvironmentVariable('RAILWAY_TOKEN','fixture-one','Process');[Environment]::SetEnvironmentVariable('RAILWAY_API_TOKEN','fixture-two','Process')}
  $ok=$false;$message=''
  try {
   if($case.Name -eq 'skip-deploy'){. $file -SkipRailwayDeploy}
   elseif($case.Name -eq 'skip-apk'){. $file -SkipApkBuild}
   else {. $file}
   if($case.Name -eq 'repeat-run'){. $file}
   $ok=$true
  }catch{$message=$_.Exception.Message}
  Assert ($ok -eq $case.Ok) "$($case.Name): expected result ($message)"
  Assert ($env:DATABASE_URL -eq 'old-process-value') "$($case.Name): restore parent database env"
  Assert ($env:AUTH_TOKEN_SECRET -eq 'old-process-auth') "$($case.Name): restore parent auth env"
  $events=@($script:events)
  Assert (@($events|Where-Object {$_ -match '^railway:(login|logout)$'}).Count -eq 0) "$($case.Name): never login/logout during setup"
  if($ok) {
   $cached = Get-Content -Raw (Join-Path $script:fixture 'mobile/lib/core/backend_defaults.dart')
   Assert ($cached.Contains('https://configured-backend.up.railway.app') -and -not $cached.Contains('127.0.0.1')) "$($case.Name): manual Flutter builds use saved public backend"
   $cachedConfig = Get-Content -Raw (Join-Path $script:fixture 'GREETSYNC_DEPLOYMENT.json') | ConvertFrom-Json
   Assert ($cachedConfig.backendUrl -eq 'https://configured-backend.up.railway.app') "$($case.Name): APK-only domain stays current"
   $expectedHealth = if ($case.Name -eq 'skip-deploy') { 'expected-build:' } else { 'expected-build:bulk-import-production-20261022' }
   Assert ($events -contains $expectedHealth) "$($case.Name): deploy waits for updated backend, APK-only allows current backend"
   if($case.Name -ne 'skip-apk') {
    Assert (@($events|Where-Object {$_ -like 'flutter:build apk *API_BASE_URL=https://configured-backend.up.railway.app'}).Count -gt 0) "$($case.Name): correct APK backend"
    Assert (Test-Path (Join-Path $script:fixture 'GreetSync-production.apk')) "$($case.Name): APK step completes"
   }
   if($case.Name -in @('local-db-wins','private-file-pins')) {
    Assert ($events -contains ('railway:variable set DATABASE_URL='+$script:public+' --service wishflow-backend --environment '+$script:mockEnvironmentId+' --skip-deploys')) "$($case.Name): deployment uses the SAME selected public URL"
    Assert (@($events|Where-Object {$_ -like '*variable set DATABASE_URL=*db.railway.internal*'}).Count -eq 0) "$($case.Name): old private backend URL is not restored"
   }
   if($case.Name -ne 'skip-deploy') {
    Assert ($events -contains 'railway:link --project e1297f67-4f5b-4159-be56-73178b459d60 --environment d52cfe49-1c90-4449-9582-b853e74706f0 --json') "$($case.Name): configured explicit IDs"
    $envText=Get-Content -Raw (Join-Path $script:fixture '.env')
    Assert ($envText.Contains('owner-extra-setting') -and $envText.Contains('{"fixture":true}')) "$($case.Name): retain extra local config"
    if($case.Name -ne 'sealed-secrets'){Assert ($envText.Contains('fixture-ai-key')) "$($case.Name): copy AI key from PostgreSQL variables"}
    if($case.Name -notin @('new-backend','sealed-secrets')) {Assert ($envText.Contains('remote-encryption') -and $envText.Contains('remote-auth')) "$($case.Name): reuse existing remote crypto keys"}
    if($case.Name -notin @('backend-public','new-backend','local-db-wins','private-file-pins')) {Assert (@($events|Where-Object {$_ -like '*variable set DATABASE_URL=*db.railway.internal*'}).Count -gt 0) "$($case.Name): retain private production DB URL"}
   }else {Assert (@($events|Where-Object {$_ -like 'railway:*' -or $_ -like 'npm:*'}).Count -eq 0) 'APK-only skips account/database/deployment'}
  }elseif($case.Name -notin @('migration-failure','apk-failure','apk-invalid','apk-stale','apk-changed-signing','paused-permanent','deploy-unknown','paused-after-accepted')) {
   Assert (@($events|Where-Object {$_ -like 'npm:run db:migrate' -or $_ -like 'railway:variable set*' -or $_ -like 'railway:up*' -or $_ -like 'flutter:*'}).Count -eq 0) "$($case.Name): stop before mutation/build"
  }
  if($case.Name -eq 'sealed-secrets'){Assert (@($events|Where-Object {$_ -match 'variable set (AUTH_TOKEN_SECRET|CREDENTIAL_ENCRYPTION_KEY|GEMINI_API_KEY|META_WEBHOOK_VERIFY_TOKEN)='}).Count -eq 0) 'Never overwrite sealed remote secrets'}
  if($case.Name -eq 'token-auth'){Assert ($env:RAILWAY_TOKEN -eq 'fixture-project-token') 'Keep explicit token authentication'}
  if($case.Name -in @('apk-invalid','apk-stale','apk-changed-signing')) {
   Assert ((Get-Content -Raw (Join-Path $script:fixture 'GreetSync-production.apk')).Trim() -eq 'previous-apk-retained') "$($case.Name): previous root APK retained"
  }
  if($ok -and $case.Name -ne 'skip-apk') {
   Assert (Test-Path (Join-Path $script:fixture 'APK_BUILD_REPORT.txt')) "$($case.Name): build report created"
   Assert (Test-Path (Join-Path $script:fixture '.android-signing/identity.json')) "$($case.Name): signing identity retained"
  }
  if ($case.Name -in @('paused-recovers','paused-permanent','deploy-unknown','paused-after-accepted')) {
   $expectedAttempts=if($case.Name -like 'paused-*' -and $case.Name -ne 'paused-after-accepted'){3}else{1}
   Assert ($script:deployAttempts -eq $expectedAttempts) "$($case.Name): only safe rejected uploads retry"
   Assert (@($events|Where-Object {$_ -eq 'npm:run db:migrate'}).Count -eq 1) "$($case.Name): retry does not rerun migration"
   if($case.Name -eq 'paused-recovers') {
    Assert ($events -contains 'wait:30' -and $events -contains 'wait:60') 'Pause retries use bounded backoff'
   } else {
    Assert (@($events|Where-Object {$_ -like 'flutter:*' -or $_ -like 'health:*'}).Count -eq 0) "$($case.Name): no stale-backend success or APK build"
    if($case.Name -eq 'paused-permanent'){Assert ($message -match 'RAILWAY_DEPLOYMENTS_PAUSED' -and $message -match 'status.railway.com') 'Permanent pause explains the real action'}
   }
  }
  Write-Host "PASS: $($case.Name)" -ForegroundColor Green
 }
}finally {
 Set-Location $initial
 foreach($key in $before.Keys){[Environment]::SetEnvironmentVariable($key,$before[$key],'Process')}
 if(Test-Path $tmp){Remove-Item -LiteralPath $tmp -Recurse -Force}
}
Write-Host "ALL PASSED: $script:count assertions across 30 mocked workflows; no live deployment or real APK."
