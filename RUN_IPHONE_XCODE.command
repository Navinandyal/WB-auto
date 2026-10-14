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
open ios/Runner.xcworkspace
printf '\n%s\n' 'In Xcode: select Runner > Signing & Capabilities > your Team.' 'Connect and trust your iPhone, enable Developer Mode, select it as the run destination, and press Run.' 'Open the workspace (.xcworkspace), not Runner.xcodeproj.'
