param([string]$ProjectPath=(Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
$script:assertions=0
function Assert([bool]$Condition,[string]$Message) {
  if (-not $Condition) { throw "ASSERT: $Message" }; $script:assertions++
}
function Reject([scriptblock]$Action,[string]$Pattern) {
  $message=''; try { & $Action | Out-Null } catch { $message=$_.Exception.Message }
  Assert ($message -match $Pattern) "Rejected: $Pattern (got: $message)"
}
foreach ($file in @('ANDROID_APK_TOOLS.ps1','INSTALL_ANDROID_USB.ps1','VERIFY_ANDROID_APK.ps1','SETUP_PRODUCTION_AND_BUILD.ps1')) {
  $tokens=$null; $errors=$null
  $null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $ProjectPath $file),[ref]$tokens,[ref]$errors)
  Assert ($errors.Count -eq 0) "$file parses"
}
. (Join-Path $ProjectPath 'ANDROID_APK_TOOLS.ps1')
$digest='a'*64
foreach($label in @('Signer #1','Signer (minSdkVersion=23, maxSdkVersion=2147483647)',
  'Signer (minSdkVersion=33 (dev release=true), maxSdkVersion=2147483647)',
  'V1 Signer:','V2 Signer:','V3 Signer:','V3.0 Signer:','V3.1 Signer:','V3.2 Signer:',
  'V2 Signer #1:','V3.1 Signer (minSdkVersion=33, maxSdkVersion=2147483647):',
  'V3.1 Signer: (minSdkVersion=32 (dev release=true), maxSdkVersion=2147483647)',
  'V3.0 Signer: (minSdkVersion=24, maxSdkVersion=32)')) {
  Assert (@(Get-GreetApkSignerDigests "$label certificate SHA-256 digest: $digest").Count -eq 1) "$label certificate accepted"
}
Assert ((@(Get-GreetApkSignerDigests "  Signer #1 certificate SHA-256 digest: $($digest.ToUpperInvariant())`r`n"))[0] -eq $digest) 'Windows CRLF/uppercase/indent normalized'
$colonDigest=((0..31|ForEach-Object{'AA'}) -join ':')
Assert ((@(Get-GreetApkSignerDigests "Signer #1 certificate SHA-256 digest: $colonDigest"))[0] -eq $digest) 'Colon-separated certificate normalized'
$combined="Signer #1 certificate SHA-256 digest: $digest`nSigner (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: $digest"
Assert (@(Get-GreetApkSignerDigests $combined).Count -eq 1) 'Duplicate signing certificate deduplicated across SDK ranges'
Assert (@(Get-GreetApkSignerDigests ($combined+"`nSigner #2 certificate SHA-256 digest: $('b'*64)")).Count -eq 2) 'Distinct signer certificates retained'
foreach($line in @("Source Stamp Signer certificate SHA-256 digest: $digest","Signer #1 public key SHA-256 digest: $digest",
  "Signer #1 certificate SHA-1 digest: $digest",'Signer #1 certificate SHA-256 digest: abcd',"Signer #1 certificate SHA-256 digest: $('a'*65)",
  "V2 Signer: public key SHA-256 digest: $digest","Source Stamp V2 Signer: certificate SHA-256 digest: $digest")) {
  Assert (@(Get-GreetApkSignerDigests $line).Count -eq 0) 'Reject stamp/public key/malformed digest'
}
Assert (@(Get-GreetApkSignerDigests "$([char]27)[32mSigner #1 certificate SHA-256 digest: $digest$([char]27)[0m").Count -eq 1) 'ANSI console decoration tolerated'
foreach ($file in @('BUILD_APK_ONLY.cmd','build-greetsync-release-apk.cmd','build-wishflow-release-apk.cmd')) {
  $launcher=Get-Content -Raw (Join-Path $ProjectPath $file)
  Assert ($launcher -match 'SETUP_PRODUCTION_AND_BUILD.ps1' -and $launcher -match '-SkipRailwayDeploy') "$file uses verified APK-only workflow"
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$tempRoot=Join-Path ([IO.Path]::GetTempPath()) ('GreetSync APK tests spaces '+[guid]::NewGuid())
$null=New-Item -ItemType Directory -Path $tempRoot
function New-FixtureApk([string]$Path,[string]$Omit='') {
  $zip=[IO.Compression.ZipFile]::Open($Path,[IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach($name in @('AndroidManifest.xml','classes.dex','resources.arsc',
      'lib/arm64-v8a/libapp.so','lib/arm64-v8a/libflutter.so',
      'lib/armeabi-v7a/libapp.so','lib/armeabi-v7a/libflutter.so')) {
      if($name -eq $Omit){continue}
      $stream=$zip.CreateEntry($name).Open()
      try {$bytes=[Text.Encoding]::UTF8.GetBytes('structural-test-fixture');$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
    }
  }finally{$zip.Dispose()}
}
try {
  $valid=Join-Path $tempRoot 'fixture.apk';New-FixtureApk $valid
  Assert-GreetApkArchive $valid;Assert $true 'APK structure accepted (fixture, not executable)'
  $bad=Join-Path $tempRoot 'bad.apk';Set-Content $bad '<html>download incomplete</html>'
  Reject {Assert-GreetApkArchive $bad} 'incomplete or invalid'
  foreach($name in @('AndroidManifest.xml','classes.dex','lib/arm64-v8a/libapp.so')) {
    $path=Join-Path $tempRoot ([guid]::NewGuid().ToString()+'.apk');New-FixtureApk $path $name
    Reject {Assert-GreetApkArchive $path} 'Missing'
  }
  $bytes=[IO.File]::ReadAllBytes($valid);[IO.File]::WriteAllBytes($bad,$bytes[0..99])
  Reject {Assert-GreetApkArchive $bad} 'incomplete or invalid'
  $metadata=[PSCustomObject]@{Signers=('a'*64);VersionCode=4}
  Assert-GreetApkUpdate $metadata $metadata;Assert $true 'Same certificate and version allowed'
  Reject {Assert-GreetApkUpdate ([PSCustomObject]@{Signers=('b'*64);VersionCode=5}) $metadata} 'Signing certificate changed'
  Reject {Assert-GreetApkUpdate ([PSCustomObject]@{Signers=('a'*64);VersionCode=3}) $metadata} 'downgrade'
  foreach($code in @('INSTALL_FAILED_UPDATE_INCOMPATIBLE','INSTALL_FAILED_VERSION_DOWNGRADE','INSTALL_FAILED_NO_MATCHING_ABIS',
    'INSTALL_FAILED_OLDER_SDK','INSTALL_FAILED_INSUFFICIENT_STORAGE','INSTALL_FAILED_USER_RESTRICTED','INSTALL_PARSE_FAILED_NO_CERTIFICATES')) {
    Assert ((Get-GreetInstallAdvice $code) -notmatch '^Share APK_INSTALL') "Specific advice for $code"
  }
  # Metadata parser and signature failure propagation, using controlled native output.
  $script:nativeCase='valid'
  function Invoke-GreetAndroidTool([string]$File,[string[]]$Arguments) {
    if($File -eq 'fake-java') {
      if($script:nativeCase -eq 'unsigned'){return [PSCustomObject]@{ExitCode=1;Output='DOES NOT VERIFY'}}
      $output='Signer #1 certificate SHA-256 digest: '+('a'*64)
      if($script:nativeCase -eq 'sdk-range'){$output='Signer (minSdkVersion=23, maxSdkVersion=2147483647) certificate SHA-256 digest: '+('a'*64)}
      if($script:nativeCase -eq 'scheme-prefix'){$output="V2 Signer: certificate SHA-256 digest: $('a'*64)`nV2 Signer: public key SHA-256 digest: $('b'*64)"}
      if($script:nativeCase -eq 'missing-cert'){$output='Verified'}
      return [PSCustomObject]@{ExitCode=0;Output=$output}
    }
    $package=if($script:nativeCase -eq 'wrong-package'){'wrong.application'}else{'com.aikyam.whatsappautomation'}
    $exit=if($script:nativeCase -eq 'bad-manifest'){1}else{0}
    return [PSCustomObject]@{ExitCode=$exit;Output="package: name='$package' versionCode='4' versionName='1.0.3'"}
  }
  $tools=[PSCustomObject]@{Java='fake-java';SignerJar='fake.jar';Aapt='fake-aapt';DiagnosticPath=(Join-Path $tempRoot 'APK_VERIFICATION_DIAGNOSTIC.txt')}
  $parsed=Read-GreetApkMetadata $valid $tools
  Assert ($parsed.VersionCode -eq 4 -and $parsed.Signers -eq ('a'*64)) 'Signature and manifest parsed'
  $script:nativeCase='sdk-range'
  $parsed=Read-GreetApkMetadata $valid $tools
  Assert ($parsed.Signers -eq ('a'*64)) 'SDK-range output reaches manifest verification'
  Assert ((Get-Content -Raw $tools.DiagnosticPath) -match 'minSdkVersion=23') 'Raw SDK-range verifier output saved'
  $script:nativeCase='scheme-prefix'
  $parsed=Read-GreetApkMetadata $valid $tools
  Assert ($parsed.Signers -eq ('a'*64)) 'Build-Tools 37 V2 certificate parsed; public-key digest excluded'
  Assert ((Get-Content -Raw $tools.DiagnosticPath) -match 'V2 Signer:') 'Raw scheme-prefixed output saved'
  foreach($case in @(@{Name='unsigned';Pattern='signature verification failed'},@{Name='missing-cert';Pattern='certificate'},
    @{Name='wrong-package';Pattern='Unexpected'},@{Name='bad-manifest';Pattern='manifest'})) {
    $script:nativeCase=$case.Name;Reject {Read-GreetApkMetadata $valid $tools} $case.Pattern
  }
  # Exercise the real USB installer orchestration with mocked Android commands.
  $originalHelper=Get-Content -Raw (Join-Path $ProjectPath 'ANDROID_APK_TOOLS.ps1')
  $mock=@'

function Get-GreetAndroidTools([string]$ProjectRoot) {
 return [PSCustomObject]@{Java='fake-java';SignerJar='fake.jar';Aapt='fake-aapt';Adb=(Join-Path $ProjectRoot 'fake-adb')}
}
function Invoke-GreetAndroidTool([string]$File,[string[]]$Arguments) {
 $script:deviceEvents.Add(($Arguments -join ' '))
 $exit=0;$output=''
 if($File -eq 'fake-java') {
  $cert='a'*64
  if($Arguments[-1] -like '*installed-base.apk' -and $script:deviceCase -eq 'key-mismatch'){$cert='b'*64}
  if($script:deviceCase -eq 'invalid-apk'){$exit=1;$output='DOES NOT VERIFY'}
      else{$output='V2 Signer: certificate SHA-256 digest: '+$cert}
 }elseif($File -eq 'fake-aapt'){
  $code=4
  if($Arguments[-1] -like '*installed-base.apk' -and $script:deviceCase -eq 'downgrade'){$code=5}
  $output="package: name='com.aikyam.whatsappautomation' versionCode='$code' versionName='1.0.3'"
 }elseif($Arguments[0] -eq 'devices'){
  $output="List of devices attached`nTESTPHONE`tdevice`n"
  if($script:deviceCase -eq 'unauthorized'){$output="List of devices attached`nTESTPHONE`tunauthorized`n"}
  if($script:deviceCase -eq 'multiple'){$output+="OTHERPHONE`tdevice`n"}
 }elseif($Arguments -contains 'getprop'){$output='35'}
 elseif($Arguments -contains 'path'){
  if($script:deviceCase -ne 'fresh-install'){$output='package:/data/app/fixture/base.apk'}else{$exit=1}
 }elseif($Arguments -contains 'pull'){
  if($script:deviceCase -eq 'pull-failure'){$exit=1;$output='denied'}
  else{Copy-Item (Join-Path $script:deviceFixture 'GreetSync-production.apk') $Arguments[-1]}
 }elseif($Arguments -contains 'install'){
  $output='Success'
  if($script:deviceCase -eq 'device-rejection'){$exit=1;$output='Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]'}
 }else{throw 'Unexpected native call'}
 return [PSCustomObject]@{ExitCode=$exit;Output=$output}
}
'@
  foreach($case in @(@{Name='fresh-install';Ok=$true},@{Name='update';Ok=$true},@{Name='key-mismatch';Ok=$false},
    @{Name='downgrade';Ok=$false},@{Name='unauthorized';Ok=$false},@{Name='multiple';Ok=$false},
    @{Name='pull-failure';Ok=$false},@{Name='invalid-apk';Ok=$false},@{Name='device-rejection';Ok=$false})) {
    $script:deviceCase=$case.Name;$script:deviceEvents=[System.Collections.Generic.List[string]]::new()
    $script:deviceFixture=Join-Path $tempRoot $case.Name;$null=New-Item -ItemType Directory $script:deviceFixture
    Copy-Item $valid (Join-Path $script:deviceFixture 'GreetSync-production.apk')
    Copy-Item (Join-Path $ProjectPath 'INSTALL_ANDROID_USB.ps1') $script:deviceFixture
    Set-Content (Join-Path $script:deviceFixture 'fake-adb') 'fixture'
    Set-Content (Join-Path $script:deviceFixture 'ANDROID_APK_TOOLS.ps1') ($originalHelper+$mock)
    $ok=$false;try{. (Join-Path $script:deviceFixture 'INSTALL_ANDROID_USB.ps1');$ok=$true}catch{}
    Assert ($ok -eq $case.Ok) "$($case.Name): installer result"
    Assert (Test-Path (Join-Path $script:deviceFixture 'APK_INSTALL_DIAGNOSTIC.txt')) "$($case.Name): diagnostic saved"
    Assert (@($script:deviceEvents|Where-Object {$_ -match 'uninstall|install -r -d'}).Count -eq 0) "$($case.Name): no uninstall/downgrade"
    if($case.Name -notin @('fresh-install','update','device-rejection')) {
      Assert (@($script:deviceEvents|Where-Object {$_ -match 'install -r'}).Count -eq 0) "$($case.Name): preflight prevents install"
    }
    if($case.Name -eq 'device-rejection') {
      Assert ((Get-Content -Raw (Join-Path $script:deviceFixture 'APK_INSTALL_DIAGNOSTIC.txt')) -match 'INSTALL_FAILED_INSUFFICIENT_STORAGE') 'Actual Android error retained'
    }
  }
  # Verify/publish the already-generated APK; no Flutter or Railway invocation.
  foreach($name in @('verify-generated','verify-explicit','verify-missing')) {
    $script:deviceCase='fresh-install';$script:deviceEvents=[System.Collections.Generic.List[string]]::new()
    $script:deviceFixture=Join-Path $tempRoot $name
    $null=New-Item -ItemType Directory $script:deviceFixture
    Copy-Item (Join-Path $ProjectPath 'VERIFY_ANDROID_APK.ps1') $script:deviceFixture
    Set-Content (Join-Path $script:deviceFixture 'ANDROID_APK_TOOLS.ps1') ($originalHelper+$mock)
    @{backendUrl='https://fixture.example.invalid'}|ConvertTo-Json|Set-Content (Join-Path $script:deviceFixture 'GREETSYNC_DEPLOYMENT.json')
    if($name -ne 'verify-missing') {
      $directory=Join-Path $script:deviceFixture 'mobile/build/app/outputs/flutter-apk'
      $null=New-Item -ItemType Directory -Path $directory -Force
      Copy-Item $valid (Join-Path $directory 'app-release.apk')
    }
    $ok=$false
    try {
      if($name -eq 'verify-explicit'){. (Join-Path $script:deviceFixture 'VERIFY_ANDROID_APK.ps1') -ApkPath $valid}
      else{. (Join-Path $script:deviceFixture 'VERIFY_ANDROID_APK.ps1')}
      $ok=$true
    }catch{}
    Assert ($ok -eq ($name -ne 'verify-missing')) "${name}: expected result"
    if($ok) {
      Assert ((Get-FileHash (Join-Path $script:deviceFixture 'GreetSync-production.apk')).Hash -eq (Get-FileHash $valid).Hash) "${name}: verified copy preserved bytes"
      Assert (Test-Path (Join-Path $script:deviceFixture 'APK_BUILD_REPORT.txt')) "${name}: report written"
    }
  }
}finally{Remove-Item -LiteralPath $tempRoot -Recurse -Force}
Write-Host "ALL PASSED: $script:assertions APK/installer assertions. Native responses mocked; no phone or app build."
