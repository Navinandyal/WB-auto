param(
  [string]$ServiceName = '',
  [string]$DatabaseUrl = '',
  [string]$RailwayProject = '',
  [string]$RailwayEnvironment = '',
  [string]$DatabaseService = '',
  [string]$KnownBackendUrl = '',
  [switch]$SkipRailwayDeploy,
  [switch]$SkipApkBuild
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Banner($text) {
  Write-Host ""
  Write-Host ("=" * 72) -ForegroundColor DarkCyan
  Write-Host "  $text" -ForegroundColor Cyan
  Write-Host ("=" * 72) -ForegroundColor DarkCyan
}

function Need-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name was not found. $installHint"
  }
}

function Invoke-Native([string]$file, [string[]]$arguments) {
  # Windows PowerShell 5.1 can convert stderr from PowerShell wrapper scripts
  # (for example npm-installed railway.ps1) into terminating ErrorRecords when
  # $ErrorActionPreference is Stop. Run native commands with Continue, then use
  # the real process exit code as the source of truth.
  $previousPreference = $ErrorActionPreference
  $global:LASTEXITCODE = 0
  try {
    $ErrorActionPreference = 'Continue'
    & $file @arguments
    $code = $LASTEXITCODE
  } catch {
    $code = if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }
    Write-Host $_.Exception.Message -ForegroundColor Red
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($code -ne 0) {
    throw "$file failed with exit code $code. See the command output above."
  }
}

function Test-Native([string]$file, [string[]]$arguments) {
  $previousPreference = $ErrorActionPreference
  $global:LASTEXITCODE = 0
  try {
    $ErrorActionPreference = 'Continue'
    & $file @arguments *> $null
    $code = $LASTEXITCODE
  } catch {
    $code = if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  return ($code -eq 0)
}

function Resolve-RailwayExecutable {
  # Prefer the .cmd launcher created by npm on Windows. Calling railway.ps1
  # directly under Windows PowerShell 5.1 is what caused the previous
  # "node.exe : Unauthorized" message to become a terminating PowerShell error
  # before the script could run `railway login`.
  $candidates = @('railway.cmd', 'railway.exe', 'railway')
  foreach ($candidate in $candidates) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  return ''
}

function New-Secret([int]$bytes = 48) {
  # Compatible with Windows PowerShell 5.1 (.NET Framework) and PowerShell 7+.
  # RandomNumberGenerator::Fill() is not available on older .NET Framework versions.
  $buf = New-Object byte[] $bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buf)
  } finally {
    if ($null -ne $rng) { $rng.Dispose() }
  }
  return [Convert]::ToBase64String($buf).Replace('+','-').Replace('/','_').TrimEnd('=')
}

function Read-ExistingEnvValue([string]$key) {
  $envFile = Join-Path $Root '.env'
  if (-not (Test-Path $envFile)) { return '' }
  foreach ($line in Get-Content $envFile) {
    if ($line -match ('^\s*' + [regex]::Escape($key) + '\s*=\s*(.*)$')) {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return ''
}

function Invoke-NativeCapture([string]$file, [string[]]$arguments) {
  # Capture stdout + stderr without allowing harmless CLI warnings on stderr to
  # become terminating NativeCommandError records in Windows PowerShell 5.1.
  $previousPreference = $ErrorActionPreference
  $global:LASTEXITCODE = 0
  $lines = @()
  try {
    $ErrorActionPreference = 'Continue'
    $lines = @(& $file @arguments 2>&1 | ForEach-Object { $_.ToString() })
    $code = $LASTEXITCODE
  } catch {
    $code = if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }
    $lines += $_.Exception.Message
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  return [PSCustomObject]@{
    ExitCode = $code
    Output = ($lines -join [Environment]::NewLine)
  }
}

function Find-RailwayDomain([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return '' }
  $match = [regex]::Match($text, '([A-Za-z0-9-]+\.up\.railway\.app)')
  if ($match.Success) { return $match.Groups[1].Value }
  return ''
}

function Get-RailwayDomain([string]$service) {
  # Current Railway CLI supports `railway domain list --service <name> --json`.
  # Use the capture helper because Railway may print deprecation/informational
  # warnings to stderr even when the command succeeds.
  $listResult = Invoke-NativeCapture $script:RailwayExe @('domain','list','--service',$service,'--json')
  $domain = if ($listResult.ExitCode -eq 0) { Find-RailwayDomain $listResult.Output } else { '' }
  if ($domain) { return $domain }

  Write-Host "No public Railway domain exists yet. Creating one..." -ForegroundColor Yellow
  $createResult = Invoke-NativeCapture $script:RailwayExe @('domain','--service',$service,'--json')
  if ($createResult.ExitCode -ne 0) {
    Write-Host $createResult.Output -ForegroundColor DarkYellow
    Write-Host "JSON domain creation did not succeed; retrying normal Railway domain creation..." -ForegroundColor Yellow
    $createResult = Invoke-NativeCapture $script:RailwayExe @('domain','--service',$service)
  }

  $domain = if ($createResult.ExitCode -eq 0) { Find-RailwayDomain $createResult.Output } else { '' }
  if ($domain) { return $domain }

  # Some CLI versions print only a success message on creation, so list again.
  Start-Sleep -Seconds 2
  $listResult = Invoke-NativeCapture $script:RailwayExe @('domain','list','--service',$service,'--json')
  $domain = if ($listResult.ExitCode -eq 0) { Find-RailwayDomain $listResult.Output } else { '' }
  if ($domain) { return $domain }

  if ($listResult.ExitCode -ne 0 -and $listResult.Output) {
    Write-Host $listResult.Output -ForegroundColor DarkYellow
  }
  throw "Railway deployment succeeded, but the public domain could not be read automatically. Open Railway > $service > Settings > Networking > Generate Domain, then rerun RUN_PRODUCTION_SETUP.cmd."
}

function Wait-ForHealth([string]$url, [string]$ExpectedBuild = '') {
  Write-Host "Waiting for $url/api/health ..."
  for ($i = 1; $i -le 40; $i++) {
    try {
      $r = Invoke-RestMethod -Uri "$url/api/health" -Method Get -TimeoutSec 8
      if ($r.status -eq 'ok' -and (-not $ExpectedBuild -or (Get-Property $r 'build') -eq $ExpectedBuild)) {
        Write-Host "[OK] Railway backend health check passed." -ForegroundColor Green
        return
      }
    } catch {}
    Start-Sleep -Seconds 3
  }
  throw "Backend did not become healthy with the expected deployment at $url/api/health. Check Railway deployment logs; the previous healthy version is not proof that the new deploy finished."
}

function Save-MobileBackendDefault([string]$url, $deploymentConfig) {
  $uri = $null
  if (-not [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$uri) -or
      $uri.Scheme -ne 'https' -or $uri.IsLoopback -or $uri.UserInfo -or
      $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/' -or
      $uri.Host -match '(?i)(\.internal$|^localhost$|^0\.0\.0\.0$)') {
    throw 'The production app requires a public HTTPS backend origin without credentials, query or fragment.'
  }
  $origin = $uri.GetLeftPart([UriPartial]::Authority).TrimEnd('/')
  $dartOrigin = ConvertTo-Json -InputObject $origin -Compress
  $encoding = New-Object System.Text.UTF8Encoding($false)
  $defaultPath = Join-Path $Root 'mobile\lib\core\backend_defaults.dart'
  $null = New-Item -ItemType Directory -Path (Split-Path -Parent $defaultPath) -Force
  $dart = "// Public backend origin only. Setup refreshes this after checking Railway health.`r`n// Credentials and API keys must never be added to this file.`r`nconst defaultApiBaseUrl = $dartOrigin;`r`n"
  [IO.File]::WriteAllText($defaultPath, $dart, $encoding)
  # Save the domain for subsequent manual Flutter and APK-only builds too.
  $deploymentConfig | Add-Member -MemberType NoteProperty -Name backendUrl -Value $origin -Force
  [IO.File]::WriteAllText((Join-Path $Root 'GREETSYNC_DEPLOYMENT.json'), ($deploymentConfig | ConvertTo-Json -Depth 12) + "`r`n", $encoding)
  Write-Host "[OK] Saved production API address for future builds: $origin" -ForegroundColor Green
}

function Test-BackendHealth([string]$url) {
  if ([string]::IsNullOrWhiteSpace($url) -or $url -notmatch '^https://') { return $false }
  try {
    $r = Invoke-RestMethod -Uri "$url/api/health" -Method Get -TimeoutSec 10
    return ($null -ne $r -and $r.status -eq 'ok')
  } catch {
    return $false
  }
}

function Get-Property($object, [string]$name, $fallback = '') {
  if ($null -eq $object) { return $fallback }
  $property = $object.PSObject.Properties[$name]
  if ($null -eq $property) { return $fallback }
  return $property.Value
}

function Read-RailwayJson([string]$text) {
  $clean = [regex]::Replace($text, '\x1B\[[0-9;]*[A-Za-z]', '')
  $start = [regex]::Match($clean, '(?m)^[ \t]*([\{\[])')
  if (-not $start.Success) { throw 'Railway did not return JSON. Update @railway/cli and retry.' }
  $endCharacter = if ($start.Groups[1].Value -eq '[') { ']' } else { '}' }
  $end = $clean.LastIndexOf($endCharacter)
  if ($end -lt $start.Groups[1].Index) { throw 'Railway JSON is incomplete.' }
  try { return ($clean.Substring($start.Groups[1].Index, $end - $start.Groups[1].Index + 1) | ConvertFrom-Json -ErrorAction Stop) }
  catch { throw 'Railway JSON could not be parsed. Update @railway/cli and retry.' }
}

function Get-LinkedId($link, [string]$camel, [string]$underscore) {
  $first = [string](Get-Property $link $camel)
  $alternate = [string](Get-Property $link $underscore)
  if ($first -and $alternate -and $first -ne $alternate) { throw 'Railway returned conflicting link identifiers.' }
  if ($first) { return $first }
  if ($alternate) { return $alternate }
  throw "Railway link response is missing $camel."
}

function Get-ProjectStatus {
  $response = Invoke-NativeCapture $script:RailwayExe @('status','--json')
  if ($response.ExitCode -ne 0) { throw 'Configured Railway project is not accessible using the saved login/token. Run LOGIN_RAILWAY_ONCE.cmd only if authentication has expired.' }
  $data = Read-RailwayJson $response.Output
  if ((Get-Property $data 'id') -ne $RailwayProject) { throw 'Railway is linked to a different project; setup stopped.' }
  return $data
}

function Get-ServiceVariables([string]$service) {
  $result = Invoke-NativeCapture $script:RailwayExe @('variable','list','--service',$service,'--environment',$RailwayEnvironment,'--json')
  if ($result.ExitCode -ne 0) { throw "Could not read variables for service '$service' in the configured environment. No captured variable values are printed." }
  return Read-RailwayJson $result.Output
}

function Get-PostgresUri([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value) -or $value -match '\$\{\{|YOUR_PASSWORD|YOUR_RAILWAY_HOST') { return $null }
  $uri = $null
  if (-not [Uri]::TryCreate($value, [UriKind]::Absolute, [ref]$uri)) { return $null }
  if ($uri.Scheme -notin @('postgres','postgresql') -or -not $uri.Host -or -not $uri.UserInfo -or $uri.AbsolutePath -eq '/') { return $null }
  return $uri
}

function Test-PublicPostgresUrl([string]$value) {
  $uri = Get-PostgresUri $value
  if ($null -eq $uri) { return $false }
  return (-not $uri.IsLoopback -and $uri.Host -notmatch '(?i)(\.internal$|^localhost$|^127\.|^0\.0\.0\.0$|^::1$)')
}

function Get-PublicDatabaseUrl($variables) {
  $value = [string](Get-Property $variables 'DATABASE_PUBLIC_URL')
  if (Test-PublicPostgresUrl $value) { return $value }
  # Some installations expose the proxy fields separately. Build a correctly
  # percent-encoded connection URL without logging any credentials.
  $hostName = [string](Get-Property $variables 'RAILWAY_TCP_PROXY_DOMAIN')
  $port = [string](Get-Property $variables 'RAILWAY_TCP_PROXY_PORT')
  $user = [string](Get-Property $variables 'POSTGRES_USER' (Get-Property $variables 'PGUSER'))
  $password = [string](Get-Property $variables 'POSTGRES_PASSWORD' (Get-Property $variables 'PGPASSWORD'))
  $database = [string](Get-Property $variables 'POSTGRES_DB' (Get-Property $variables 'PGDATABASE'))
  if ($hostName -and $port -match '^\d+$' -and $user -and $password -and $database -and
      "$hostName$user$password$database" -notmatch '\$\{\{') {
    $value = 'postgresql://' + [Uri]::EscapeDataString($user) + ':' + [Uri]::EscapeDataString($password) + '@' + $hostName + ':' + $port + '/' + [Uri]::EscapeDataString($database)
    if (Test-PublicPostgresUrl $value) { return $value }
  }
  $value = [string](Get-Property $variables 'DATABASE_URL')
  if (Test-PublicPostgresUrl $value) { return $value }
  return ''
}

function Find-DatabaseSettings($project, $backend) {
  $remoteUrl = [string](Get-Property $backend 'DATABASE_URL')
  $remoteUri = Get-PostgresUri $remoteUrl
  $services = @(Get-Property (Get-Property $project 'services' $null) 'edges' @() | ForEach-Object { Get-Property $_ 'node' $null })
  $matches = @()
  foreach ($service in $services) {
    $name = [string](Get-Property $service 'name')
    if (-not $name -or $name -eq $ServiceName) { continue }
    if ($DatabaseService -and $name -ne $DatabaseService -and (Get-Property $service 'id') -ne $DatabaseService) { continue }
    $values = Get-ServiceVariables $name
    if (-not (Get-Property $values 'POSTGRES_DB') -and -not (Get-Property $values 'PGDATABASE') -and -not (Get-Property $values 'DATABASE_PUBLIC_URL')) { continue }
    $publicUrl = Get-PublicDatabaseUrl $values
    if (-not $publicUrl) { continue }
    $privateUri = Get-PostgresUri ([string](Get-Property $values 'DATABASE_URL'))
    $sameDatabase = ($null -ne $remoteUri -and $null -ne $privateUri -and $privateUri.Host -eq $remoteUri.Host)
    $matches += [PSCustomObject]@{ Name = $name; PublicUrl = $publicUrl; Variables = $values; MatchesBackend = $sameDatabase }
  }
  $exact = @($matches | Where-Object { $_.MatchesBackend })
  if ($exact.Count -eq 1) { return $exact[0] }
  if ($matches.Count -eq 1) { return $matches[0] }
  if ($matches.Count -gt 1) { throw 'Several PostgreSQL databases exist. Set databaseService once in GREETSYNC_DEPLOYMENT.json; no selection prompt is opened.' }
  if ($DatabaseService) { throw 'The configured database service has no resolved public PostgreSQL URL.' }
  return $null
}

function Write-EnvUpdates([hashtable]$values) {
  $path = Join-Path $Root '.env'
  $lines = if (Test-Path $path) { @(Get-Content $path) } else { @('# Local server settings. Do not commit this file.') }
  foreach ($key in $values.Keys) {
    $value = [string]$values[$key]
    if ($value -match '[\r\n"]') { throw "Unsupported multiline/quoted value for $key; existing .env was not overwritten." }
    $newLine = $key + '="' + $value + '"'
    $pattern = '^\s*' + [regex]::Escape($key) + '\s*='
    $found = $false
    $lines = @($lines | ForEach-Object {
      if ($_ -match $pattern) { if (-not $found) { $newLine; $found = $true } }
      else { $_ }
    })
    if (-not $found) { $lines += $newLine }
  }
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($path, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, $encoding)
}

function Test-SealedVariable($object, [string]$key) {
  if ($null -eq $object) { return $false }
  $property = $object.PSObject.Properties[$key]
  return ($null -ne $property -and $null -eq $property.Value)
}

function Read-ConfigurationValue([string]$key, $backend, $database) {
  $local = Read-ExistingEnvValue $key
  if ($local) { return $local }
  $remote = [string](Get-Property $backend $key)
  if ($remote) { return $remote }
  return [string](Get-Property $database $key)
}

$processValues = @{}
try {
  Banner 'GreetSync Automatic Setup + Railway Deploy + Release APK'
  $configPath = Join-Path $Root 'GREETSYNC_DEPLOYMENT.json'
  if (-not (Test-Path $configPath)) { throw 'GREETSYNC_DEPLOYMENT.json is missing from the project folder.' }
  $config = Get-Content -Raw $configPath | ConvertFrom-Json
  if (-not $RailwayProject) { $RailwayProject = [string](Get-Property $config 'projectId') }
  if (-not $RailwayEnvironment) { $RailwayEnvironment = [string](Get-Property $config 'environmentId') }
  if (-not $ServiceName) { $ServiceName = [string](Get-Property $config 'backendService') }
  if (-not $DatabaseService) { $DatabaseService = [string](Get-Property $config 'databaseService') }
  if (-not $KnownBackendUrl) { $KnownBackendUrl = [string](Get-Property $config 'backendUrl') }
  $projectGuid = [guid]::Empty; $environmentGuid = [guid]::Empty
  if (-not [guid]::TryParse($RailwayProject, [ref]$projectGuid) -or -not [guid]::TryParse($RailwayEnvironment, [ref]$environmentGuid) -or -not $ServiceName) {
    throw 'The configured project/environment IDs or backend service are invalid.'
  }
  if (-not $SkipRailwayDeploy) {
    Need-Command node 'Install Node.js 20+ and reopen Command Prompt.'
    Need-Command npm 'Install Node.js/npm and reopen Command Prompt.'
  }
  if (-not $SkipApkBuild) { Need-Command flutter 'Install Flutter and add its bin directory to PATH.' }
  if (-not (Test-Path (Join-Path $Root 'package.json')) -or -not (Test-Path (Join-Path $Root 'mobile\pubspec.yaml'))) { throw 'Run this file from the complete extracted GreetSync folder.' }

  $backendUrl = $KnownBackendUrl.TrimEnd('/')
  $remoteBackend = $null; $databaseVariables = $null; $serverDatabaseUrl = ''
  if (-not $SkipRailwayDeploy) {
    $script:RailwayExe = Resolve-RailwayExecutable
    if (-not $script:RailwayExe) {
      Invoke-Native npm @('install','-g','@railway/cli')
      $script:RailwayExe = Resolve-RailwayExecutable
    }
    if (-not $script:RailwayExe) { throw 'Railway CLI is not on PATH after installation.' }
    # Keep the existing login and token environment. Do not log out, clear tokens,
    # select another account or open a browser during a normal setup run.
    if ($env:RAILWAY_TOKEN -and $env:RAILWAY_API_TOKEN) { throw 'Set only one of RAILWAY_TOKEN or RAILWAY_API_TOKEN before running setup.' }
    $login = Invoke-NativeCapture $script:RailwayExe @('whoami','--json')
    if ($login.ExitCode -ne 0 -and -not $env:RAILWAY_TOKEN -and -not $env:RAILWAY_API_TOKEN) {
      throw 'Railway login is missing/expired. Run LOGIN_RAILWAY_ONCE.cmd once, then rerun setup. Your database password and Gemini key are not Railway login tokens.'
    }
    $linkResult = Invoke-NativeCapture $script:RailwayExe @('link','--project',$RailwayProject,'--environment',$RailwayEnvironment,'--json')
    if ($linkResult.ExitCode -ne 0) { throw 'The saved Railway login/token cannot link the configured project. Check GREETSYNC_DEPLOYMENT.json or refresh login once; no account prompt was opened.' }
    $link = Read-RailwayJson $linkResult.Output
    if ((Get-LinkedId $link 'projectId' 'project_id') -ne $RailwayProject -or (Get-LinkedId $link 'environmentId' 'environment_id') -ne $RailwayEnvironment) { throw 'Railway linked an unexpected target; setup stopped.' }
    $project = Get-ProjectStatus
    Write-Host '[OK] Using the configured Railway project/environment and saved login.' -ForegroundColor Green
    if (-not (Test-Native $script:RailwayExe @('service',$ServiceName))) {
      Invoke-Native $script:RailwayExe @('add','--service',$ServiceName)
      $project = Get-ProjectStatus
    }
    $remoteBackend = Get-ServiceVariables $ServiceName
    $database = Find-DatabaseSettings $project $remoteBackend
    if ($null -ne $database) { $databaseVariables = $database.Variables }
    if (-not $DatabaseUrl) {
      $DatabaseUrl = Get-PublicDatabaseUrl $remoteBackend
      if (-not $DatabaseUrl -and $null -ne $database) { $DatabaseUrl = $database.PublicUrl }
    }
    if (-not (Test-PublicPostgresUrl $DatabaseUrl)) { throw 'No resolved public PostgreSQL URL was found. Enable PostgreSQL TCP proxy/DATABASE_PUBLIC_URL in the configured project; raw ${{...}} references cannot be used on Windows.' }
    $serverDatabaseUrl = [string](Get-Property $remoteBackend 'DATABASE_URL')
    if ($null -eq (Get-PostgresUri $serverDatabaseUrl)) { $serverDatabaseUrl = [string](Get-Property $databaseVariables 'DATABASE_URL') }
    if ($null -eq (Get-PostgresUri $serverDatabaseUrl)) { $serverDatabaseUrl = $DatabaseUrl }
    Write-Host '[OK] Resolved the database settings automatically (credentials hidden).' -ForegroundColor Green
    $backendUrl = 'https://' + (Get-RailwayDomain $ServiceName)

    $sealedAuth = Test-SealedVariable $remoteBackend 'AUTH_TOKEN_SECRET'
    $sealedEncryption = Test-SealedVariable $remoteBackend 'CREDENTIAL_ENCRYPTION_KEY'
    $auth = [string](Get-Property $remoteBackend 'AUTH_TOKEN_SECRET')
    if (-not $auth) { $auth = Read-ExistingEnvValue 'AUTH_TOKEN_SECRET' }
    if (-not $auth -or $auth -match 'change-this|replace-with') { $auth = New-Secret 48 }
    $encryption = [string](Get-Property $remoteBackend 'CREDENTIAL_ENCRYPTION_KEY')
    if (-not $encryption) { $encryption = Read-ExistingEnvValue 'CREDENTIAL_ENCRYPTION_KEY' }
    if (-not $encryption -or $encryption -match 'change-this|replace-with') { $encryption = New-Secret 48 }
    $settings = @{ DATABASE_URL=$DatabaseUrl; DATABASE_SSL='true'; PUBLIC_BASE_URL=$backendUrl; META_PUBLIC_BASE_URL=$backendUrl; APP_URL=$backendUrl }
    if (-not $sealedAuth) { $settings['AUTH_TOKEN_SECRET']=$auth }
    if (-not $sealedEncryption) { $settings['CREDENTIAL_ENCRYPTION_KEY']=$encryption }
    foreach ($key in @('GEMINI_API_KEY','GEMINI_TEMPLATE_MODEL','META_PLATFORM_APP_ID','META_PLATFORM_APP_SECRET','META_EMBEDDED_SIGNUP_CONFIG_ID','META_GRAPH_API_VERSION','META_WEBHOOK_VERIFY_TOKEN')) {
      if (Test-SealedVariable $remoteBackend $key) { continue }
      $value = Read-ConfigurationValue $key $remoteBackend $databaseVariables
      if ($value) { $settings[$key] = $value }
    }
    if (-not (Test-SealedVariable $remoteBackend 'GEMINI_TEMPLATE_MODEL') -and (-not $settings.ContainsKey('GEMINI_TEMPLATE_MODEL') -or $settings['GEMINI_TEMPLATE_MODEL'] -eq 'gemini-3.8-flash')) { $settings['GEMINI_TEMPLATE_MODEL'] = 'auto' }
    if (-not $settings.ContainsKey('META_GRAPH_API_VERSION') -and -not (Test-SealedVariable $remoteBackend 'META_GRAPH_API_VERSION')) { $settings['META_GRAPH_API_VERSION']='v26.0' }
    if (-not $settings.ContainsKey('META_WEBHOOK_VERIFY_TOKEN') -and -not (Test-SealedVariable $remoteBackend 'META_WEBHOOK_VERIFY_TOKEN')) { $settings['META_WEBHOOK_VERIFY_TOKEN']=New-Secret 32 }
    Write-EnvUpdates $settings
    foreach ($key in $settings.Keys) {
      $processValues[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
      [Environment]::SetEnvironmentVariable($key, [string]$settings[$key], 'Process')
    }
    Banner 'Validate backend and initialize the configured PostgreSQL database'
    Invoke-Native npm @('ci')
    Invoke-Native npm @('run','lint')
    Invoke-Native npm @('run','db:migrate')
    Invoke-Native npm @('run','build')
    # Recheck the project before writing production configuration or deploying.
    $null = Get-ProjectStatus
    $serverSettings = @{}; foreach ($key in $settings.Keys) { $serverSettings[$key]=$settings[$key] }
    $serverSettings['DATABASE_URL']=$serverDatabaseUrl; $serverSettings['NODE_ENV']='production'
    foreach ($key in $serverSettings.Keys) {
      Invoke-Native $script:RailwayExe @('variable','set',"$key=$($serverSettings[$key])",'--service',$ServiceName,'--environment',$RailwayEnvironment,'--skip-deploys')
    }
    Invoke-Native $script:RailwayExe @('up','--service',$ServiceName,'--environment',$RailwayEnvironment,'--ci')
  }
  if ($backendUrl -notmatch '^https://[^/\s]+/?$') { throw 'A valid HTTPS backend origin is required for the app.' }
  $expectedBuild = if ($SkipRailwayDeploy) { '' } else { 'meta-connect-production-20261013-v2' }
  Wait-ForHealth $backendUrl -ExpectedBuild $expectedBuild
  Save-MobileBackendDefault $backendUrl $config
  if (-not $SkipApkBuild) {
    Banner 'Build and verify Android release APK'
    . (Join-Path $Root 'ANDROID_APK_TOOLS.ps1')
    $apk = Join-Path $Root 'mobile\build\app\outputs\flutter-apk\app-release.apk'
    # Remove only the generated output, retaining dependency/build caches and
    # the previous verified production APK. A stale output cannot pass as new.
    if (Test-Path $apk) { Remove-Item -LiteralPath $apk -Force }
    Push-Location (Join-Path $Root 'mobile')
    try {
      Invoke-Native flutter @('pub','get')
      Invoke-Native flutter @('build','apk','--release',"--dart-define=API_BASE_URL=$backendUrl")
    } finally { Pop-Location }
    if (-not (Test-Path $apk)) { throw 'Flutter finished but the APK output was not found.' }
    Publish-GreetApk -ProjectRoot $Root -ApkPath $apk -BackendUrl $backendUrl
    Write-Host "[OK] Created and verified $(Join-Path $Root 'GreetSync-production.apk'). See APK_BUILD_REPORT.txt." -ForegroundColor Green
  } else {
    Write-Host '[INFO] APK build skipped because -SkipApkBuild was supplied. Run RUN_PRODUCTION_SETUP.cmd without that flag to deploy and build the APK.' -ForegroundColor Yellow
  }
  @"
GreetSync production deployment
Backend API: $backendUrl
Health: $backendUrl/api/health
Meta webhook callback: $backendUrl/api/webhooks/whatsapp
Meta Embedded Signup callback: $backendUrl/meta/embedded-signup/callback
No Railway passwords or API keys are compiled into the mobile app.
"@ | Set-Content -Encoding UTF8 (Join-Path $Root 'PRODUCTION_DEPLOYMENT_INFO.txt')
  Banner 'DONE'
  Write-Host "Backend: $backendUrl" -ForegroundColor Green
  Write-Host "Webhook: $backendUrl/api/webhooks/whatsapp"
  Write-Host "Meta callback: $backendUrl/meta/embedded-signup/callback"
  if (-not $SkipApkBuild) { Write-Host "APK: $(Join-Path $Root 'GreetSync-production.apk')" -ForegroundColor Green }
} finally {
  foreach ($key in $processValues.Keys) { [Environment]::SetEnvironmentVariable($key, $processValues[$key], 'Process') }
}
