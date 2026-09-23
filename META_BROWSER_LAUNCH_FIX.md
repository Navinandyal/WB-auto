# Meta Business Login button fix

The previous Flutter screen hosted Meta Embedded Signup inside `webview_flutter`. Meta/Facebook authentication may refuse or fail to open from embedded WebViews/pop-up contexts.

## New behavior

1. WishFlow requests a short-lived Embedded Signup session URL from its backend.
2. `Continue with Meta` opens that URL in the phone's secure external browser using `url_launcher`.
3. The hosted WishFlow signup page loads Meta's official JavaScript SDK and starts Business Login / WhatsApp Embedded Signup.
4. The business owner authenticates directly with Meta and selects their own Business Portfolio, WABA and phone number.
5. WishFlow backend exchanges the authorization code, encrypts the business token and stores WABA/Phone Number mapping against that business.
6. Flutter polls `GET /api/whatsapp/connection` and also checks again when the user returns from the browser.
7. When status becomes `CONNECTED`, the Flutter screen closes and refreshes the dashboard/WhatsApp connection state.

No Facebook password is collected by WishFlow. Each business receives and stores its own WhatsApp authorization.

## Local USB development

The browser URL still uses `http://127.0.0.1:3000` when running through the local Android development runner. Keep `adb reverse tcp:3000 tcp:3000` active. For real Meta production testing, use an HTTPS backend domain configured in the Meta Developer App.
