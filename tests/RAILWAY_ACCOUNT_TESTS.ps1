param([string]$SetupPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'SETUP_PRODUCTION_AND_BUILD.ps1'))
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$tests=0
function Check([bool]$condition,[string]$message) {
  if (-not $condition) { throw "ASSERTION: $message" }
  $script:tests++
}
$tokens=$null;$parseErrors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($SetupPath,[ref]$tokens,[ref]$parseErrors)
Check ($parseErrors.Count -eq 0) 'PowerShell syntax parses'
$original=Get-Content -Raw $SetupPath
# Load only function definitions for direct regressions, without setup side effects.
foreach($node in $ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)) {
  Invoke-Expression $node.Extent.Text
}
$json=ConvertFrom-RailwayJson ('CLI warning'+[Environment]::NewLine+'{"email":"current@example.invalid"}')
Check ($json.email -eq 'current@example.invalid') 'JSON permits leading warning'
try { ConvertFrom-RailwayJson 'not-json';throw 'unexpected success' } catch {
  Check ($_.Exception.Message -match 'valid JSON') 'Malformed CLI JSON rejected'
}
$array = @(ConvertFrom-RailwayJson ('CLI warning'+[Environment]::NewLine+'[{"id":"one"},{"id":"two"}]'))
Check ($array.Count -eq 2 -and $array[1].id -eq 'two') 'Project array is parsed without truncating to object'
Check (@(ConvertFrom-RailwayJson '[]').Count -eq 0) 'Empty project array is preserved'
$nodes = @(Get-RailwayEnvironments ([PSCustomObject]@{environments=@([PSCustomObject]@{id='denied';name='private';canAccess=$false},[PSCustomObject]@{id='ok';name='public';canAccess=$true})}))
Check ($nodes.Count -eq 1 -and $nodes[0].Id -eq 'ok') 'Inaccessible environments excluded'
$realLinkFormat = ConvertFrom-RailwayJson '{"projectId":"e1297f67-4f5b-4159-be56-73178b459d60","projectName":"agile-forgiveness","environmentId":"d52cfe49-1c90-4449-9582-b853e74706f0","environmentName":"production"}'
Check ((Get-RailwayProperty $realLinkFormat 'project_id' '') -eq '') 'Reproduce old underscore-only lookup failure with real camelCase format'
Check ((Get-RailwayLinkIdentifier $realLinkFormat 'projectId' 'project_id') -eq 'e1297f67-4f5b-4159-be56-73178b459d60') 'Current Railway projectId parsed correctly'
Check ((Get-RailwayLinkIdentifier $realLinkFormat 'environmentId' 'environment_id') -eq 'd52cfe49-1c90-4449-9582-b853e74706f0') 'Current Railway environmentId parsed correctly'
function Fake-Failure {
  $global:LASTEXITCODE=7
}
try { Invoke-Native Fake-Failure @('variable','set','DATABASE_URL=fixture-secret');throw 'unexpected success' } catch {
  Check ($_.Exception.Message -match 'DATABASE_URL=<redacted>') 'Command failures redact variable assignment'
  Check ($_.Exception.Message -notmatch 'fixture-secret') 'No secret in thrown command error'
}

$script:scenario=''
$script:account=''
$script:projectId='project-before-selection'
$script:events=[System.Collections.Generic.List[string]]::new()
$script:answers=[System.Collections.Generic.Queue[string]]::new()
$script:fixture=''
$script:loginCount=0
function Read-Host {
  param([string]$Prompt,[switch]$AsSecureString)
  $script:events.Add('prompt:'+$Prompt)
  if ($script:answers.Count -eq 0) { throw "Unexpected prompt: $Prompt" }
  $answer=$script:answers.Dequeue()
  if ($AsSecureString) { return ConvertTo-SecureString $answer -AsPlainText -Force }
  return $answer
}
function Fake-Railway {
  $command=@($args);$verb=$command[0]
  $script:events.Add('railway:'+($command -join ' '))
  if ([Environment]::GetEnvironmentVariable('RAILWAY_TOKEN','Process') -or [Environment]::GetEnvironmentVariable('RAILWAY_API_TOKEN','Process')) {
    throw 'A token overrode the interactive login'
  }
  $global:LASTEXITCODE=0
  switch ($verb) {
    'whoami' {
      if (-not $script:account) { $global:LASTEXITCODE=1;return }
      @{name='Fixture';email=$script:account;workspaces=@()}|ConvertTo-Json -Compress
    }
    'logout' { $script:account='';'Logged out' }
    'login' {
      $script:loginCount++
      if ($script:scenario -eq 'login-failure') { $global:LASTEXITCODE=1;return }
      if ($script:scenario -eq 'wrong-browser' -and $script:loginCount -eq 1) {$script:account='old@example.invalid'}
      else {$script:account='new@example.invalid'}
      'Browser login completed'
    }
    'list' {
      if ($script:scenario -eq 'list-failure') {$global:LASTEXITCODE=1;return}
      if ($script:scenario -eq 'no-projects') {'[]';return}
      if ($script:scenario -eq 'bad-project-json') {'[{"id":"bad"}]';return}
      $envs=@(@{node=@{id='production-env';name='production';canAccess=$true}})
      if ($script:scenario -eq 'multi-environments') {
        $envs=@(@{node=@{id='staging-env';name='staging';canAccess=$true}},@{node=@{id='production-env';name='production';canAccess=$true}})
      }
      if ($script:scenario -eq 'no-environments') {$envs=@()}
      if ($script:scenario -eq 'inaccessible-environment') {$envs=@(@{node=@{id='denied';name='private';canAccess=$false}})}
      $projects=@(@{id='selected-project';name='agile-forgiveness';workspace=@{id='workspace-fixture';name='My Projects'};environments=@{edges=$envs}})
      if ($script:scenario -in @('multi-projects','project-cancel','invalid-project-number')) {
        $projects=@(@{id='other-project';name='another-app';workspace=@{id='other-workspace';name='Other workspace'};environments=@{edges=$envs}},$projects[0])
      }
      'CLI warning before project list'
      ConvertTo-Json -InputObject $projects -Depth 10 -Compress
    }
    'link' {
      # Reproduce the user's non-interactive Railway behavior. Bare link fails.
      if ($command -notcontains '--project' -or $command -notcontains '--environment' -or $command -notcontains '--json') {
        $global:LASTEXITCODE=1;'--project required in non-interactive mode.';return
      }
      if ($script:scenario -eq 'link-failure') {$global:LASTEXITCODE=1;return}
      $script:projectId=$command[[Array]::IndexOf($command,'--project')+1]
      $environment=$command[[Array]::IndexOf($command,'--environment')+1]
      if ($script:scenario -eq 'wrong-link-environment') {$environment='wrong-env'}
      # Match the official Rust LinkOutput JSON serializer's camelCase keys.
      $payload=@{projectId=$script:projectId;projectName='Fixture project';environmentId=$environment;environmentName='production'}
      if ($script:scenario -eq 'legacy-link-format') { $payload=@{project_id=$script:projectId;environment_id=$environment} }
      if ($script:scenario -eq 'missing-link-project') { $payload.Remove('projectId') }
      if ($script:scenario -eq 'conflicting-link-project') { $payload['project_id']='different-project' }
      if ($script:scenario -eq 'wrong-link-project') { $payload['projectId']='different-project' }
      $payload|ConvertTo-Json -Compress
    }
    'status' {
      if ($script:scenario -eq 'status-failure') {$global:LASTEXITCODE=1;return}
      if ($command -contains '--json') {@{id=$script:projectId;name='Selected project'}|ConvertTo-Json -Compress}
      else {'Project: Selected project; Environment: production'}
    }
    'service' { 'Backend selected' }
    'variable' { 'Variables set' }
    'up' { 'Deployed' }
    'domain' { '{"domain":"selected-backend.up.railway.app"}' }
    default { throw "Unexpected Railway command: $verb" }
  }
}
function npm {
  $script:events.Add('npm:'+($args -join ' '));$global:LASTEXITCODE=0
  if ($args -contains 'build') {
    if ($script:scenario -eq 'account-changed') {$script:account='changed@example.invalid'}
    if ($script:scenario -eq 'project-changed') {$script:projectId='changed-project'}
  }
}
function flutter {
  $script:events.Add('flutter:'+($args -join ' '));$global:LASTEXITCODE=0
  if ($args -contains 'apk') {
    $dir=Join-Path $script:fixture 'mobile/build/app/outputs/flutter-apk'
    New-Item -ItemType Directory -Path $dir -Force|Out-Null
    Set-Content -Path (Join-Path $dir 'app-release.apk') -Value 'fixture-only-not-an-apk'
  }
}

# Run the actual main workflow with only command discovery/health checks replaced.
# CLI, npm and Flutter resolve to mocked commands above; no remote writes occur.
$edits=@()
foreach ($node in $ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)) {
  $replacement=$null
  switch ($node.Name) {
    'Resolve-RailwayExecutable' {$replacement="function Resolve-RailwayExecutable { return 'Fake-Railway' }"}
    'Need-Command' {$replacement='function Need-Command($name,$installHint) {}'}
    'Wait-ForHealth' {$replacement='function Wait-ForHealth([string]$url) { $script:events.Add("health:"+$url) }'}
  }
  if($replacement){$edits+=@{Start=$node.Extent.StartOffset;End=$node.Extent.EndOffset;Text=$replacement}}
}
$testSource=$original
foreach($edit in ($edits|Sort-Object Start -Descending)) {
  $testSource=$testSource.Substring(0,$edit.Start)+$edit.Text+$testSource.Substring($edit.End)
}
$initialDirectory=Get-Location
$temp=Join-Path ([IO.Path]::GetTempPath()) ('greetsync railway spaces '+[guid]::NewGuid())
New-Item -ItemType Directory -Path $temp|Out-Null
$originalToken=[Environment]::GetEnvironmentVariable('RAILWAY_TOKEN','Process')
$originalApiToken=[Environment]::GetEnvironmentVariable('RAILWAY_API_TOKEN','Process')
try {
  foreach($case in @(
    @{Name='current';Initial='current@example.invalid';Answers=@('1','y');Success=$true},
    @{Name='switch';Initial='old@example.invalid';Answers=@('2','1','y');Success=$true},
    @{Name='no-login';Initial='';Answers=@('1','1','y');Success=$true},
    @{Name='wrong-browser';Initial='old@example.invalid';Answers=@('2','2','1','y');Success=$true},
    @{Name='invalid-choice';Initial='current@example.invalid';Answers=@('invalid','1','y');Success=$true},
    @{Name='cancel';Initial='old@example.invalid';Answers=@('0');Success=$false},
    @{Name='login-failure';Initial='old@example.invalid';Answers=@('2');Success=$false},
    @{Name='link-failure';Initial='current@example.invalid';Answers=@('1');Success=$false},
    @{Name='status-failure';Initial='current@example.invalid';Answers=@('1');Success=$false},
    @{Name='account-changed';Initial='current@example.invalid';Answers=@('1','y');Success=$false},
    @{Name='project-changed';Initial='current@example.invalid';Answers=@('1','y');Success=$false},
    @{Name='multi-projects';Initial='current@example.invalid';Answers=@('1','2','y');Success=$true},
    @{Name='multi-environments';Initial='current@example.invalid';Answers=@('1','2','y');Success=$true},
    @{Name='project-cancel';Initial='current@example.invalid';Answers=@('1','0');Success=$false},
    @{Name='invalid-project-number';Initial='current@example.invalid';Answers=@('1','999','nonsense','2','y');Success=$true},
    @{Name='list-failure';Initial='current@example.invalid';Answers=@('1');Success=$false},
    @{Name='no-projects';Initial='current@example.invalid';Answers=@('1');Success=$false},
    @{Name='bad-project-json';Initial='current@example.invalid';Answers=@('1');Success=$false},
    @{Name='no-environments';Initial='current@example.invalid';Answers=@('1');Success=$false},
    @{Name='inaccessible-environment';Initial='current@example.invalid';Answers=@('1');Success=$false},
    @{Name='wrong-link-environment';Initial='current@example.invalid';Answers=@('1');Success=$false},
    @{Name='legacy-link-format';Initial='current@example.invalid';Answers=@('1','y');Success=$true},
    @{Name='missing-link-project';Initial='current@example.invalid';Answers=@('1');Success=$false},
    @{Name='conflicting-link-project';Initial='current@example.invalid';Answers=@('1');Success=$false},
    @{Name='wrong-link-project';Initial='current@example.invalid';Answers=@('1');Success=$false},
    @{Name='explicit-target';Initial='current@example.invalid';Answers=@('1','y');Success=$true},
    @{Name='database-default-no';Initial='current@example.invalid';Answers=@('1','','postgresql://user:fixture@new-public-host:5432/db');Success=$true}
  )) {
    $script:scenario=$case.Name;$script:account=$case.Initial;$script:projectId='previous-project';$script:loginCount=0
    $script:events=[System.Collections.Generic.List[string]]::new()
    $script:answers=[System.Collections.Generic.Queue[string]]::new()
    foreach($answer in $case.Answers){$script:answers.Enqueue($answer)}
    $script:fixture=Join-Path $temp $case.Name
    New-Item -ItemType Directory -Path (Join-Path $script:fixture 'mobile') -Force|Out-Null
    Set-Content -Path (Join-Path $script:fixture 'package.json') -Value '{}'
    Set-Content -Path (Join-Path $script:fixture 'mobile/pubspec.yaml') -Value 'name: fixture'
    Set-Content -Path (Join-Path $script:fixture '.env') -Value @'
DATABASE_URL="postgresql://user:fixture@old-public-host:5432/db"
AUTH_TOKEN_SECRET="fixture-auth"
CREDENTIAL_ENCRYPTION_KEY="fixture-encryption"
PUBLIC_BASE_URL="https://previous-backend.up.railway.app"
'@
    $fixtureScript=Join-Path $script:fixture 'SETUP_PRODUCTION_AND_BUILD.ps1'
    Set-Content -Path $fixtureScript -Value $testSource -Encoding utf8BOM
    [Environment]::SetEnvironmentVariable('RAILWAY_TOKEN','fixture-project-token','Process')
    [Environment]::SetEnvironmentVariable('RAILWAY_API_TOKEN','fixture-account-token','Process')
    $success=$false;$errorText=''
    try {
      if($case.Name -eq 'explicit-target') { . $fixtureScript -RailwayProject 'agile-forgiveness' -RailwayEnvironment 'production' }
      else { . $fixtureScript }
      $success=$true
    } catch {$errorText=$_.Exception.Message}
    Check ($success -eq $case.Success) "$($case.Name): expected success/failure ($errorText)"
    Check ([Environment]::GetEnvironmentVariable('RAILWAY_TOKEN','Process') -eq 'fixture-project-token') "$($case.Name): restore project token"
    Check ([Environment]::GetEnvironmentVariable('RAILWAY_API_TOKEN','Process') -eq 'fixture-account-token') "$($case.Name): restore account token"
    $events=@($script:events)
    if($success) {
      $links=@($events|Where-Object {$_ -like 'railway:link --project * --environment * --json'});$linkIndex=if($links.Count){[Array]::IndexOf($events,$links[0])}else{-1};$migrationIndex=[Array]::IndexOf($events,'npm:run db:migrate')
      Check ($links.Count -eq 1 -and $linkIndex -ge 0 -and $migrationIndex -gt $linkIndex) "$($case.Name): select target before migration"
      Check (@($events|Where-Object {$_ -like 'flutter:build apk *selected-backend.up.railway.app*'}).Count -eq 1) "$($case.Name): APK targets selected backend"
      Check (@($events|Where-Object {$_ -like 'flutter:build apk *previous-backend*'}).Count -eq 0) "$($case.Name): do not compile old URL"
      Check (Test-Path (Join-Path $script:fixture 'GreetSync-production.apk')) "$($case.Name): automatic build completes"
      Check ((Get-Content -Raw (Join-Path $script:fixture '.env')) -match 'fixture-encryption') "$($case.Name): preserve encryption key"
    } else {
      Check (@($events|Where-Object {$_ -like 'railway:up*' -or $_ -like 'railway:variable*' -or $_ -like 'flutter:*'}).Count -eq 0) "$($case.Name): stop deployment/APK on failure"
      if($case.Name -notin @('account-changed','project-changed')) {
        Check (@($events|Where-Object {$_ -like 'npm:run db:migrate'}).Count -eq 0) "$($case.Name): stop before migration"
      }
    }
    if ($case.Name -in @('switch','wrong-browser')) {
      Check ($events -contains 'railway:logout') "$($case.Name): clear old CLI login"
      Check ($script:account -eq 'new@example.invalid') "$($case.Name): new identity selected"
    }
    if($case.Name -eq 'database-default-no') {
      Check ((Get-Content -Raw (Join-Path $script:fixture '.env')) -match 'new-public-host') 'New account can replace old database; Enter does not reuse it'
    }
    if($success) {
      Check ($links[0] -eq 'railway:link --project selected-project --environment production-env --json') "$($case.Name): IDs used instead of TTY picker"
    }
    Write-Host "PASS: $($case.Name)" -ForegroundColor Green
  }
} finally {
  Set-Location $initialDirectory
  [Environment]::SetEnvironmentVariable('RAILWAY_TOKEN',$originalToken,'Process')
  [Environment]::SetEnvironmentVariable('RAILWAY_API_TOKEN',$originalApiToken,'Process')
  if(Test-Path $temp) {Remove-Item -LiteralPath $temp -Recurse -Force}
}
Write-Host "ALL PASSED: $tests assertions; actual setup workflow mocked; no remote deployments or real APK build."
