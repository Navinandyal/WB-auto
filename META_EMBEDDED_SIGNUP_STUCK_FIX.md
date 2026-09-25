# Meta Embedded Signup stuck on Loading Meta — fix

This build fixes the common case where Android opens the signup URL in Brave or another privacy browser and Meta's JavaScript SDK never becomes ready.

## Changes
- Android now attempts to open the Embedded Signup page specifically in Google Chrome.
- Falls back to the system browser only if Chrome is unavailable.
- The signup page no longer stays on `Loading Meta…` indefinitely: after the SDK timeout it shows a clear error and a retry button.
- Added clearer diagnostics for blocked `connect.facebook.net` and Meta JavaScript SDK domain configuration.
- Existing per-business encrypted WABA / Phone Number ID / access-token capture remains unchanged.

## Meta-side requirements
The provider Meta app still must allow the HTTPS ngrok hostname used by the signup page in the appropriate Meta JavaScript SDK/App Domain settings. If the provider app is unpublished, external business accounts may also be blocked by Meta even when the code is correct.
