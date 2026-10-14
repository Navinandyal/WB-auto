#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")" && pwd)"
mobile_dir="$project_dir/mobile"
source "$mobile_dir/scripts/ios_common.sh"
method="${1:-development}"
case "$method" in
 --help) printf '%s\n' 'Usage: bash BUILD_IPHONE_IPA.command [development|ad-hoc|app-store]' 'Sign in to Xcode and configure the Apple Team ID with PREPARE_IPHONE_MAC.command first.'; exit 0 ;;
 development|ad-hoc|app-store) ;;
 *) fail 'Choose development, ad-hoc or app-store.' ;;
esac
check_mac
read_config
cd "$mobile_dir"
python3 tool/ios_configure.py export-options --method "$method"
api_url="$(config_value apiUrl)"
flutter pub get
flutter build ios --release --config-only --no-codesign --dart-define="API_BASE_URL=$api_url"
(cd ios && pod install)
build_started="$(python3 -c 'import time; print(time.time())')"
flutter build ipa --release --export-options-plist=ios/ExportOptions.generated.plist --dart-define="API_BASE_URL=$api_url"
python3 - "$mobile_dir/build/ios/ipa" "$build_started" <<'PY'
import sys
from pathlib import Path
files=[path for path in Path(sys.argv[1]).glob('*.ipa') if path.stat().st_mtime >= float(sys.argv[2])]
if not files:
    raise SystemExit('No IPA was exported. Open build/ios/archive/Runner.xcarchive in Xcode Organizer and complete signing/export. Do not rename a ZIP or unsigned .app to .ipa.')
print('Exported signed IPA:')
for path in files:print(path)
PY
open build/ios/ipa
