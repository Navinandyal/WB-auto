#!/bin/bash
set -euo pipefail
fail() { printf '\n%s\n' "ERROR: $*" >&2; exit 1; }
require_command() { command -v "$1" >/dev/null 2>&1 || fail "$1 is not installed or is not on PATH. See IPHONE_MAC_START_HERE.md."; }
check_mac() {
  [ "$(uname -s)" = "Darwin" ] || fail "iPhone builds require macOS and Xcode. Run this command on your MacBook."
  require_command python3
  require_command flutter
  require_command xcodebuild
  require_command xcrun
  require_command pod
  xcrun --sdk iphoneos --show-sdk-path >/dev/null 2>&1 || fail "Select the full Xcode installation and install its iOS platform support."
  xcodebuild -version > "$mobile_dir/.ios-xcode-version.tmp"
  flutter --version --machine > "$mobile_dir/.ios-flutter-version.tmp"
  python3 - "$mobile_dir/.ios-xcode-version.tmp" "$mobile_dir/.ios-flutter-version.tmp" <<'PY'
import json,re,sys
from pathlib import Path
xcode=Path(sys.argv[1]).read_text();match=re.search(r'Xcode (\d+)\.(\d+)',xcode)
if not match or tuple(map(int,match.groups())) < (26,2):
    raise SystemExit('Xcode 26.2 or newer is required for the included Firebase SDK. Update Xcode first.')
text=Path(sys.argv[2]).read_text();data=json.loads(text[text.index('{'):])
def version(value):
    match=re.match(r'(\d+)\.(\d+)\.(\d+)',value)
    return tuple(map(int,match.groups())) if match else (0,0,0)
if version(data.get('frameworkVersion','')) < (3,44,0) or version(data.get('dartSdkVersion','')) < (3,12,0):
    raise SystemExit('Use Flutter stable 3.44+ with Dart 3.12+. Run flutter channel stable and flutter upgrade.')
if data.get('channel') != 'stable':
    raise SystemExit('Use Flutter stable for this package. Run flutter channel stable and flutter upgrade.')
print('Flutter/Dart and Xcode versions are compatible.')
PY
  rm "$mobile_dir/.ios-xcode-version.tmp" "$mobile_dir/.ios-flutter-version.tmp"
  pod --version
}
read_config() {
  [ -f "$mobile_dir/ios_build_config.json" ] || fail "Run PREPARE_IPHONE_MAC.command first."
  python3 - "$mobile_dir/ios_build_config.json" <<'PY'
import json,sys
from pathlib import Path
json.loads(Path(sys.argv[1]).read_text())
PY
}
config_value() {
  python3 - "$mobile_dir/ios_build_config.json" "$1" <<'PY'
import json,sys
from pathlib import Path
value=json.loads(Path(sys.argv[1]).read_text()).get(sys.argv[2],'')
print(str(value))
PY
}
