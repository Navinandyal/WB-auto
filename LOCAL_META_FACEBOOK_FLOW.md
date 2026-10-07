# GreetSync local Meta/Facebook connection flow

## Why a laptop IP alone is not enough

The Flutter app can call the backend locally through ADB reverse (`http://127.0.0.1:3000`) or a same-Wi-Fi LAN IP. Meta/Facebook Embedded Signup is different: the page that loads the Facebook JavaScript SDK needs an HTTPS web origin that Meta can reach and trust. A plain `http://192.168.x.x:3000` address is not a substitute for that HTTPS origin.

## Development mode implemented in this project

1. Keep the Node backend on the laptop at port 3000.
2. Keep Flutter API traffic on `http://127.0.0.1:3000` using ADB reverse.
3. Install/authenticate ngrok once on the laptop.
4. `run-greetsync-android-dev.cmd` detects ngrok. If it is available, it starts `ngrok http 3000` and prints the HTTPS URL.
5. The GreetSync backend reads the active HTTPS tunnel from ngrok's local API (`127.0.0.1:4040`) automatically.
6. Admin Meta Platform Setup only requires Meta App ID, Meta App Secret, Embedded Signup Configuration ID, and Graph API version. The HTTPS override can stay blank for local development.
7. A business owner taps Continue with Meta. GreetSync creates a short-lived signed session and opens the ngrok HTTPS `/meta/embedded-signup` page in the phone browser.
8. The browser loads Meta's own Facebook SDK. The business owner signs in to their own Meta account and selects their own Business Portfolio/WABA/WhatsApp number.
9. Meta returns an authorization code plus WABA/phone-number mapping. The backend exchanges the code, encrypts the business token, and stores it under that business owner.
10. On success the browser opens `greetsync://meta-connected`, returning to the Flutter app. The app rechecks `/api/whatsapp/connection` and shows the connected account.

## One-time ngrok setup

Install ngrok from its official distribution, then authenticate it once using the token from your ngrok account. After `ngrok` is available in PATH, the GreetSync runner handles tunnel startup/detection automatically.

You can also start it yourself:

```bat
ngrok http 3000
```

Then rerun the GreetSync app. The backend automatically discovers the active `https://...ngrok...` URL.

## Meta Developer configuration

The GreetSync Meta Developer App still needs its App ID, App Secret, and Embedded Signup Configuration ID configured in Admin Settings. Meta may require the current HTTPS tunnel host to be added to allowed app domains/origins depending on the Meta product/configuration settings. A stable ngrok domain is recommended so this does not change every run.

## Business isolation

The Meta platform App ID/Config ID only starts the onboarding window. Every business owner authenticates their own Meta account and receives their own WABA, Phone Number ID and access token. Access tokens are encrypted on the backend and are not deleted when the business user logs out of GreetSync.
