# Fixing “App not installed as package appears to be invalid”

This update addresses the Android APK build/install workflow. It retains the
configured Railway account/project and the existing app/backend source.

## Latest correction: certificate output parser

Your supplied diagnostics identify the exact failure: **Build-Tools 37.0.0**
reports **Verification exit code: 0**, **Verified using v2: true**, and the label
**V2 Signer: certificate SHA-256 digest: ...**. The previous parser accepted
numbered and SDK-range labels but still rejected this scheme-prefixed label.
That was a helper bug; the logs do not report a failed APK signature.

The corrected parser recognizes numbered, SDK-range and scheme-prefixed labels
(V1, V2, V3, V3.1, V3.2, etc.), including numbered/ranged scheme labels. It still
requires real signature verification to succeed and excludes public-key hashes
and source-stamp certificates from the app signing identity.

The supplied install diagnostic stops during certificate reading, before adb
installation. It therefore does **not** contain the phone's invalid-package
failure code yet. Fixing this helper makes it possible to run that device check.

To reuse your successful build, extract/replace the updated files in your
existing **D:\Aikyam\project** folder, keeping `mobile/build`, the original
keystore, `.android-signing`, `.env` and owner Firebase files. Then run:

```cmd
VERIFY_ANDROID_APK.cmd
```

This verifies `mobile/build/app/outputs/flutter-apk/app-release.apk` and publishes
the verified **GreetSync-production.apk** without rebuilding or logging into
Railway. If that generated file is missing (for example, you extracted into a
new directory), use **BUILD_APK_ONLY.cmd** first.

After verification succeeds, connect the phone with USB debugging enabled and
run **INSTALL_ANDROID_USB.cmd**. This checks the installed app before updating.
The earlier screenshot's phone error is still a separate issue until Android
reports its actual failure code. If it fails, share **APK_INSTALL_DIAGNOSTIC.txt**.
If verification itself fails, share **APK_VERIFICATION_DIAGNOSTIC.txt**, which now
contains the raw Android verifier output and selected tool paths.

The dependency/Kotlin notices in the supplied log did not prevent its release
build from succeeding. This patch does not migrate the native plugin stack.

The screenshot alone does not identify Android's actual failure code. The
failing APK was not supplied. A signing-key mismatch, damaged/incomplete APK,
version downgrade, or phone compatibility issue needs different treatment.
No installation on your phone has been verified here.

## Build on your Windows PC

1. Extract the complete ZIP. Keep your existing `.env`, Firebase configuration
   and signing files if you use them. Build on the PC that produced the
   previously working APK. Keep its original keystore.
2. If available, copy the last working **GreetSync-production.apk** into the
   extracted GreetSync folder before building. The script checks the new build
   against that APK's certificate and version. It does not replace it if those
   update checks fail.
3. Run **BUILD_APK_ONLY.cmd**. This uses your configured backend and does not
   request Railway authentication or redeploy. Use **RUN_PRODUCTION_SETUP.cmd**
   when you also need backend deployment; its saved-login workflow is unchanged.
4. Use the new root **GreetSync-production.apk** only after the command succeeds.
   Its exact byte count, SHA256, version and certificate fingerprint are in
   **APK_BUILD_REPORT.txt**. A larger universal APK is not by itself invalid.

The build now removes the previous generated output before invoking Flutter,
checks archive entries and ARM libraries, uses Android's **apksigner** to verify
the signature, reads the manifest with **aapt**, and checks the copied file hash.
The signing certificate and version are saved locally in
`.android-signing/identity.json`. Keep that directory between builds. These
checks prevent a stale or invalid artifact being reported as a successful APK.
They cannot guarantee every device will accept an APK.

The legacy **build-greetsync-release-apk.cmd** and **build-wishflow-release-apk.cmd**
also use this verified workflow. An optional first argument or `API_BASE_URL`
environment value can select a different HTTPS backend, without account prompts.

The SDK Build-Tools and Java used by Flutter must be installed. The script finds
the SDK through `ANDROID_SDK_ROOT`, `ANDROID_HOME`, Flutter's generated
`mobile/android/local.properties`, or the normal Windows Android Studio location.

## Get the precise Android error / install through USB

Connect the phone to your PC. Enable **Developer options → USB debugging** and
accept the phone's authorization prompt. Run:

```cmd
INSTALL_ANDROID_USB.cmd
```

The helper verifies the APK, compares its certificate and version against the
installed app, then uses `adb install -r` to update while retaining app data.
It does not uninstall, clear data, force a version downgrade, or bypass signature
checks. If the certificates differ it stops before installation.

It writes **APK_INSTALL_DIAGNOSTIC.txt** with the exact Android error where
installation reaches Android, or the preflight reason otherwise. If the error
continues, supply this report and the APK that failed. The screenshot's generic
popup is not enough to distinguish the underlying causes.

To examine/install the exact downloaded file instead of the new build:

```cmd
INSTALL_ANDROID_USB.cmd -ApkPath "D:\Downloads\GreetSync-production (14).apk"
```

With several connected phones, add `-DeviceSerial YOUR_SERIAL`.

## Keep the original signing key

Earlier builds hardcoded `signingConfigs.debug`. Debug-signed APKs can be
sideloaded, but the debug keystore normally belongs to that computer/user.
Moving PCs or replacing that keystore can change the certificate. Android
requires the original app signing identity for an update.

This version supports **mobile/android/key.properties** for your original key.
It preserves the existing debug-key fallback when that file is absent, so it
does not automatically change the identity of your previous builds. A present
but incomplete signing configuration fails instead of silently using another key.

If the last working build used this PC's debug key, its usual location is
`C:/Users/YOUR_WINDOWS_USER/.android/debug.keystore`. The supplied
`mobile/android/key.properties.example` shows how to reference that key.
Copy it to **key.properties** only when needed and update the path. For a
release keystore, use its actual alias/passwords instead of the example values.
Relative paths resolve from **mobile/android**; use `/` in Windows paths.

Do not delete/regenerate the old key to fix an update. Back up the original
keystore privately. It is not included in this ZIP. The certificate fingerprint
alone cannot recover a missing private key. If the installed app came from
Google Play, use the appropriate Play-signed update channel/key.

## Failure codes

| Error | Action |
| --- | --- |
| Certificate changed / INSTALL_FAILED_UPDATE_INCOMPATIBLE | Restore the original keystore; keep the installed app and its data. |
| INSTALL_FAILED_VERSION_DOWNGRADE | Increase the `+build` number in mobile/pubspec.yaml above the installed version. |
| INSTALL_PARSE_FAILED… / INSTALL_FAILED_INVALID_APK | Rebuild and transfer the complete verified APK. Compare its byte count/hash. |
| INSTALL_FAILED_NO_MATCHING_ABIS | Build the universal APK using the included command. |
| INSTALL_FAILED_OLDER_SDK | This app requires Android 6.0/API 23 or newer. |
| INSTALL_FAILED_INSUFFICIENT_STORAGE | Free phone storage, then retry. |
| Unauthorized / restricted USB installation | Accept debugging/installation authorization on the phone. |

Official references:
- https://developer.android.com/studio/publish/app-signing
- https://developer.android.com/tools/apksigner
- https://developer.android.com/tools/adb
- https://docs.flutter.dev/deployment/android

## Verification performed for this update

196 assertions across 24 mocked setup workflows and 98 APK/installer assertions
passed. They cover stale output, invalid files, changed certificates, version
downgrades, retained previous APKs, metadata parsing, device authorization and
diagnostic output. Android/ADB responses in these suites are mocked. No complete
Flutter APK build or physical-phone installation was run in this Linux workspace.

An additional smoke check used the real Android SDK Build-Tools 35.0.0 and
ephemeral signed structural APK fixtures: manifest/certificate extraction
succeeded; different signing keys, unsigned files and tampered APKs were
rejected. These fixtures are not runnable GreetSync builds and are not included.

The certificate-format regression was also reproduced with a real official
Android V3.1 fixture: the old pattern found no certificate, while the corrected
parser recovered both SDK-range signer certificates. The new no-rebuild
verification command was exercised with generated-path, explicit-path and
missing-file cases using mocked native responses. Full app/device testing
remains unverified here.

The Build-Tools 37 fix was checked directly against **both supplied diagnostic
files**, recovering exactly the certificate digest and excluding the public-key
digest. The mocked USB installer and no-rebuild verification command now use
`V2 Signer:` output in their regression cases. The real Android Build-Tools 35
checks continue to pass; no user's APK binary or phone was supplied here.

Real **Android Build-Tools 37.0.0** was downloaded and exercised against temporary
signed structural fixtures as well. V2 and V3.0 output now passes metadata
verification with the same signer identity; SDK-range V3.1/V3.0 certificates are
also extracted. Unsigned/tampered fixtures and different signing keys are still
rejected. These checks do not constitute a full GreetSync build or phone install.
