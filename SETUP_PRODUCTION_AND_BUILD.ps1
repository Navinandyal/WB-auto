param([switch]$SkipRenderDeploy,[switch]$SkipApkBuild)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
if(-not(Get-Command node -ErrorAction SilentlyContinue)){throw 'Install Node.js 22+ and reopen Command Prompt.'}
if(-not(Get-Command npm.cmd -ErrorAction SilentlyContinue)){throw 'Install Node.js/npm and reopen Command Prompt.'}
if(-not(Test-Path (Join-Path $root 'GREETSYNC_RENDER.local.env')) -and -not $env:RENDER_API_KEY){
 throw 'One-time setup: copy GREETSYNC_RENDER.local.env.example to GREETSYNC_RENDER.local.env, fill the Render/Supabase settings and preserve the old encryption keys. Read RENDER_SUPABASE_START_HERE.md. No Railway login is needed.'
}
$configuration=Get-Content -Raw (Join-Path $root 'GREETSYNC_DEPLOYMENT.json')|ConvertFrom-Json
if($configuration.provider -ne 'render' -or $configuration.databaseProvider -ne 'supabase' -or $configuration.serviceId -notmatch '^srv-[A-Za-z0-9]+$' -or $configuration.backendUrl -notmatch '^https://'){
 throw 'Fill serviceId and backendUrl in GREETSYNC_DEPLOYMENT.json once. See RENDER_SUPABASE_START_HERE.md. No deployment was started.'
}
Write-Host 'GreetSync - Render backend + Supabase database + verified Android APK' -ForegroundColor Cyan
$previous=$ErrorActionPreference
try { $ErrorActionPreference='Continue'; & npm.cmd ci; $code=$LASTEXITCODE }
finally { $ErrorActionPreference=$previous }
if($code -ne 0){throw 'npm ci failed. Deployment was not started.'}
$arguments=@((Join-Path $root 'tools/deploy-production.mjs'))
if($SkipRenderDeploy){$arguments+='--skip-render-deploy'}
if($SkipApkBuild){$arguments+='--skip-apk'}
& node @arguments
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
