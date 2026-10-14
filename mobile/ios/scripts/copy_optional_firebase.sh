#!/bin/sh
set -eu
source_file="${SRCROOT}/Runner/GoogleService-Info.plist"
destination="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/GoogleService-Info.plist"
if [ -f "$source_file" ]; then
  mkdir -p "$(dirname "$destination")"
  cp "$source_file" "$destination"
elif [ -f "$destination" ]; then
  # Remove a previous build's optional Firebase configuration from this output.
  rm "$destination"
fi
