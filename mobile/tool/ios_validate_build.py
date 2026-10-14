#!/usr/bin/env python3
"""Xcode build-phase checks for a missing backend and mismatched Firebase app."""
import base64
import os
import plistlib
import sys
from pathlib import Path
from ios_configure import validate_url


def verify(environment):
    entries = {}
    for item in environment.get('DART_DEFINES', '').split(','):
        if not item.strip():
            continue
        try:
            decoded = base64.b64decode(item, validate=True).decode()
        except (ValueError, UnicodeDecodeError):
            raise ValueError('DART_DEFINES is invalid. Re-run PREPARE_IPHONE_MAC.command.')
        key, separator, value = decoded.partition('=')
        if separator:
            entries[key] = value
    value = entries.get('API_BASE_URL')
    if not value:
        raise ValueError('No backend is configured. Run PREPARE_IPHONE_MAC.command with --api-url first.')
    debug = environment.get('CONFIGURATION') == 'Debug'
    local = environment.get('GREETSYNC_BACKEND_MODE') == 'local'
    validate_url(value, local_development=debug and local)
    source = Path(environment.get('SRCROOT', '.')) / 'Runner/GoogleService-Info.plist'
    if source.is_file():
        firebase = plistlib.loads(source.read_bytes())
        if firebase.get('BUNDLE_ID') != environment.get('PRODUCT_BUNDLE_IDENTIFIER'):
            raise ValueError('The Firebase iOS bundle ID does not match Runner. Download the matching GoogleService-Info.plist.')
    if 'RunnerPush.entitlements' in environment.get('CODE_SIGN_ENTITLEMENTS', '') and not source.is_file():
        raise ValueError('Push is enabled but GoogleService-Info.plist is missing.')
    return value

if __name__ == '__main__':
    try:
        verify(os.environ)
    except (ValueError, OSError, plistlib.InvalidFileException) as error:
        print('error: GreetSync iOS setup: ' + str(error), file=sys.stderr)
        sys.exit(1)
