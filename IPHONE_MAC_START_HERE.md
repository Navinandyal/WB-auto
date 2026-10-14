# GreetSync on your iPhone through Xcode

This update uses **GreetSync_Webhook_Dynamic_AI_Fix_20261006(1).zip** as its only source. The app version remains **1.0.3+4**. It adds an iOS project and Mac setup/build commands. The Oct 7 admin redesign is not included. Backend code and the existing app screens remain from your supplied version.

**You do not need an IPA to run on your connected iPhone.** Xcode can build, sign and install the app directly. An IPA is a signed distribution package; build/export it on your Mac after setting up Apple signing. This ZIP contains source, not an IPA. It has not been compiled or tested in Xcode in this Linux environment, so error-free execution on your particular Mac/iPhone cannot be guaranteed.

## 1. Install the Mac tools once

Use a Mac and an iPhone running **iOS 15 or later**. Install:

- **Full Xcode 26.2 or newer**, with its iOS platform support and command-line tools. Use a macOS release supported by your chosen Xcode version. Launch Xcode once and finish its setup/license prompts.
- **Flutter stable 3.44 or newer**, including **Dart 3.12 or newer**. Add Flutter's `bin` directory to your shell PATH. This version is required by the existing contacts dependency.
- **CocoaPods** and **Python 3** on your PATH. This project uses CocoaPods and disables Flutter's Swift Package Manager integration for this project only. The Podfile pins Firebase's native iOS SDK to **12.19.0**, with an iOS 15 minimum.

In Terminal, select your actual full Xcode installation (adjust the path if Xcode has a different name):

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
flutter doctor -v
flutter --version
xcodebuild -version
pod --version
python3 --version
```

If Flutter reports a missing iOS platform, install it in **Xcode → Settings → Components/Platforms**. If you use Homebrew, its CocoaPods and Python packages are an installation option (`brew install cocoapods python`). The included commands do not install global tools or accept licenses for you.

Sign in to your Apple account in **Xcode → Settings → Accounts**. A Personal Team can run the basic app on your own iPhone with Apple's free provisioning limits. TestFlight/App Store distribution, ad hoc distribution and APNs push notifications need the appropriate Apple Developer membership and profiles. A free Personal Team is not a general IPA distribution option.

## 2. Prepare this ZIP on your MacBook

Unzip it, open Terminal, and change directory to the extracted **GreetSync** folder. For example, type `cd ` and drag that folder into Terminal. Use the following interactive command:

```bash
bash PREPARE_IPHONE_MAC.command
```

Enter your **existing reachable HTTPS backend origin**, such as `https://your-real-backend.example`, with no `/api` suffix. Enter your actual 10-character Apple Team ID if you know it; otherwise leave it blank and select your team in Xcode later. The domain above is an example and must be replaced with your running backend. This script does not deploy or start a backend.

For explicit settings, use:

```bash
bash PREPARE_IPHONE_MAC.command \
  --api-url https://YOUR-REAL-BACKEND \
  --bundle-id com.YOURBUSINESS.greetsync \
  --team-id YOURTEAMID
```

Replace every uppercase placeholder. The bundle ID must be unique and owned/usable by your selected Apple team. If you already have an Apple/Firebase app identifier, use that exact identifier instead. Never paste a signing password, certificate or API secret as the Team ID.

The preparation command configures Xcode and Flutter to use the same backend, fetches Flutter iOS artifacts and Dart dependencies, installs Pods and checks Dart source errors. It keeps existing lint warnings from blocking setup. The first run needs internet access and can take several minutes. Do not run `flutter create .` over this package; that would replace the supplied native setup.

### If your backend runs locally on the Mac

Your physical iPhone cannot reach the Mac through `127.0.0.1` or `localhost`; those addresses refer to the iPhone itself. Put both devices on the same network, run the backend on an accessible interface, allow its port through the Mac firewall, then use the Mac's actual LAN address:

```bash
bash PREPARE_IPHONE_MAC.command \
  --api-url http://YOUR-MAC-LAN-IP:3000 \
  --local-development
```

This explicit option enables plain HTTP **only for Debug builds**. Release/Profile builds and IPA exports require HTTPS. Before exporting, run PREPARE again with your deployed HTTPS backend. A simulator can use a Mac-local backend, but that does not make `localhost` correct on a real phone. Android's USB reverse/tunnel commands do not apply to iPhone.

## 3. Run directly on your iPhone

```bash
bash RUN_IPHONE_XCODE.command
```

This opens **`mobile/ios/Runner.xcworkspace`**. Always use the workspace, because it contains the installed Pods.

1. Select **Runner → TARGETS: Runner → Signing & Capabilities**. Enable automatic signing and choose your Apple team. Verify the bundle identifier.
2. Connect the iPhone to your Mac, unlock it, accept **Trust This Computer**, and enable **Settings → Privacy & Security → Developer Mode** if requested. Follow Apple's restart/confirmation prompts.
3. Select the **Runner** scheme and your connected iPhone as the destination.
4. Press **Run ▶**. If iOS asks you to trust your development identity, use **Settings → General → VPN & Device Management** as directed by iOS.
5. Test login, contacts permission (including limited contacts on supported iOS), Face ID/Touch ID, template/file selection, map preview, external Meta signup and a scheduled message with your existing backend.

Face ID and Touch ID require an enrolled biometric identity. The app retains its password fallback. File selection uses the system file picker; no unused camera, microphone or precise-GPS permission was added. Map template selection continues to use the existing map UI rather than requesting the device's location.

The app's local alerts/reminders work without Firebase after notification permission is granted. It retains the **nearest 50 future scheduled reminders** to stay within iOS pending-notification capacity and refreshes them when schedule data is loaded. Local alerts do not send WhatsApp messages: the deployed backend remains responsible for every scheduled send, including while the iPhone app is closed.

## 4. Optional Firebase/APNs push notifications

Basic app startup, local alerts and direct Xcode testing do not require a Firebase configuration. For real remote push:

1. Register an **iOS** app in your Firebase project using exactly the bundle ID selected above.
2. Download its genuine **GoogleService-Info.plist** and place it at **`mobile/ios/Runner/GoogleService-Info.plist`**. Do not reuse Android's `google-services.json`, a fake plist or an Android Firebase app ID.
3. Enable Push Notifications for your Apple App ID/signing profile and upload your APNs authentication key to **Firebase → Project Settings → Cloud Messaging → Apple app configuration**. Configure the existing backend's Firebase admin credentials for the same Firebase project, as described in the existing setup guide. The APNs private key belongs in Firebase, not in this source ZIP.
4. Run PREPARE again with your actual bundle/team/backend settings and **`--push`** added. It enables the push entitlement and background fetch/remote notification modes. In Xcode verify **Push Notifications** and **Background Modes → Remote notifications / Background fetch** under Signing & Capabilities and ensure provisioning permits them.
5. Install/run on your iPhone and grant notification permission. Test a real remote notification with the app foregrounded and backgrounded. Debug signing uses the development APNs environment; the IPA workflow selects the appropriate export environment.

Firebase method swizzling remains enabled. The Dart service waits for an APNs token before requesting the FCM token, retries initial registration and cancels token callbacks on logout. This addresses an iOS startup timing failure; it does not provision your Apple/Firebase accounts. Push notifications and WhatsApp delivery are separate services.

For this workflow, the plist is sufficient. Advanced Dart-defined Firebase configuration is also supported through the existing common sender/project settings plus **FIREBASE_IOS_APP_ID**, **FIREBASE_IOS_API_KEY** and **FIREBASE_IOS_BUNDLE_ID**; do not use Android's FIREBASE_APP_ID for an iPhone. Real remote push still needs native entitlements, APNs provisioning and the matching plist used by the setup checks.

## 5. Build a real signed IPA

First get the app running through Xcode. Set your actual Team ID with PREPARE and use an HTTPS backend. For release/device signing, verify **Runner → Build Settings → Development Team** for Debug, Profile and Release, especially if you selected a team manually in Xcode earlier. Sign in to Xcode and let it obtain valid certificates/profiles; this package contains none.

Then choose one export:

```bash
# For registered development devices and a suitable development profile:
bash BUILD_IPHONE_IPA.command development

# For registered devices with an eligible ad hoc distribution profile:
bash BUILD_IPHONE_IPA.command ad-hoc

# For App Store Connect / TestFlight distribution:
bash BUILD_IPHONE_IPA.command app-store
```

The command invokes `flutter build ipa`, using generated export options for your Apple team. Xcode's current method names are `debugging`, `release-testing` and `app-store-connect`, respectively. A development/ad hoc IPA requires its destination device to be covered by the provisioning profile. An App Store IPA is distributed through App Store Connect/TestFlight, not installed by simply opening it on the phone.

Outputs after a successful build:

- **Archive:** `mobile/build/ios/archive/Runner.xcarchive`
- **Signed IPA:** `mobile/build/ios/ipa/*.ipa`

If automatic export needs additional signing, open the archive in Xcode Organizer and complete **Distribute App** with the appropriate method/profile. The script reports success only when a new IPA exists from the current build. It does not rename a ZIP or unsigned app into an IPA and does not delete earlier signed IPA files.

## 6. Checks and common fixes

```bash
bash CHECK_IPHONE_BUILD_MAC.command
```

This runs Dart analysis, existing Flutter tests, reminder/setup regressions and an unsigned **iOS simulator** build on your Mac. A simulator build checks native compilation but is not a signed physical-iPhone build. Finish with a real device Run and signed archive/export test.

| Message or symptom | Action |
|---|---|
| `flutter`, `pod` or `python3` not found | Install the tool and ensure the same Terminal shell can run it. Start from Terminal using `bash …command`. |
| Xcode SDK missing / command-line tools selected | Select full Xcode with `xcode-select`, open Xcode and install its iOS platform support. |
| No backend configured | Run PREPARE with your real API origin. Direct Xcode Run is intentionally blocked before configuration. |
| Backend unreachable on iPhone | Check HTTPS, deployed backend health, real LAN address when developing locally and the firewall. `localhost` on iPhone is not the Mac. |
| HTTP blocked in Release/Profile | Reconfigure with an HTTPS backend; the Debug-only exception is not carried into release. |
| Firebase bundle identifier mismatch | Download the plist for the exact configured iOS bundle ID; rerun PREPARE. |
| Provisioning profile / no signing identity | Choose your account/team in Xcode, verify bundle ownership, connect/register the device and allow Xcode to create/download eligible profiles. |
| Personal Team cannot enable Push Notifications | Omit `--push` for a basic app run or configure a paid eligible Apple Developer team and APNs. |
| APNs/FCM token not ready | Verify the real iOS plist, push entitlement/profile, notification permission and APNs key in Firebase; test on a device. |
| A CocoaPods spec is missing | Verify network access and run `pod install --repo-update` in `mobile/ios`, then rerun the command. |
| Pods/module not found in Xcode | Run PREPARE and open `Runner.xcworkspace`, not `Runner.xcodeproj`. |
| A shell build phase is denied | The supplied project disables Xcode user-script sandboxing for Flutter build phases. Restore that setting if you manually changed it. |
| Meta signup opens Safari/default browser | Expected on iPhone. Complete the existing HTTPS backend callback, return to the app and allow its existing connection poll to refresh. |
| WhatsApp delivery is pending/failed | Inspect the backend/Meta callback diagnostics from the existing webhook guide. Building an iPhone binary does not change Meta webhook configuration or turn an unconfirmed delivery into a success. |

## Verification and official references

The included `TEST_REPORT.md` records exactly what was verified here. Dart source/configuration/structural tests passed; Xcode compilation, CocoaPods resolution, Apple signing, real iPhone UI, APNs and live Meta operations must be checked on your Mac/accounts. No IPA is included in this ZIP.

- [Flutter iOS setup](https://docs.flutter.dev/platform-integration/ios/setup)
- [Flutter iOS deployment and IPA export](https://docs.flutter.dev/deployment/ios)
- [Flutter stable SDK archive](https://docs.flutter.dev/install/archive)
- [Firebase Cloud Messaging Flutter prerequisites](https://firebase.google.com/docs/cloud-messaging/flutter/get-started)
- [Firebase Apple SDK releases and native minimums](https://firebase.google.com/support/release-notes/ios)
- [Apple Developer membership](https://developer.apple.com/support/compare-memberships/)
