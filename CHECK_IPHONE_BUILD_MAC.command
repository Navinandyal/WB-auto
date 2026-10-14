#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")" && pwd)"
mobile_dir="$project_dir/mobile"
source "$mobile_dir/scripts/ios_common.sh"
check_mac
read_config
cd "$mobile_dir"
flutter pub get
flutter build ios --debug --config-only --no-codesign
(cd ios && pod install)
flutter analyze --no-pub --no-fatal-infos --no-fatal-warnings
flutter test
dart run test/ios_reminders_check.dart
python3 -m unittest discover -s tool/tests -v
# A simulator build validates native plugin compilation without device signing.
flutter build ios --simulator --debug
printf '\n%s\n' 'Simulator build passed. This is not a signed iPhone IPA.' 'Next, open RUN_IPHONE_XCODE.command and test on your real iPhone.'
