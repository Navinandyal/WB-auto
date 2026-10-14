#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")" && pwd)"
mobile_dir="$project_dir/mobile"
source "$mobile_dir/scripts/ios_common.sh"
if [ "${1:-}" = "--help" ]; then
  printf '%s\n' 'Usage: bash PREPARE_IPHONE_MAC.command --api-url https://YOUR-BACKEND --bundle-id com.aikyam.whatsappautomation --team-id YOURTEAMID' 'Optional: --push (requires matching GoogleService-Info.plist and paid Apple capabilities), --local-development (Debug HTTP only).' 'No arguments: prompts for the backend URL and signing team.'
  exit 0
fi
check_mac
if [ "$#" -eq 0 ]; then
  read -r -p 'Reachable HTTPS backend URL: ' api_url
  read -r -p 'Apple Team ID (10 characters; Enter for simulator/manual Xcode selection): ' team_id
  set -- --api-url "$api_url" --team-id "$team_id"
fi
cd "$mobile_dir"
python3 tool/ios_configure.py configure "$@"
flutter precache --ios
flutter pub get
flutter build ios --debug --config-only --no-codesign
(cd ios && pod install)
flutter analyze --no-pub --no-fatal-infos --no-fatal-warnings
printf '\n%s\n' 'iOS dependencies and Xcode build settings are prepared.' 'Open RUN_IPHONE_XCODE.command, select your signing team and iPhone, then press Run.' 'For an IPA export, use BUILD_IPHONE_IPA.command after configuring your Apple Team ID.'
