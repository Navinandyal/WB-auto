#!/bin/sh
set -eu
"${GREETSYNC_PYTHON_PATH:-/usr/bin/python3}" "${SRCROOT}/../tool/ios_validate_build.py"
