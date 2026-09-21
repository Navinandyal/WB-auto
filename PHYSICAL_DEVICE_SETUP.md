# Physical Android Device Setup

The Flutter app defaults to `http://127.0.0.1:3000` for local Android development.

When using a physical Android phone over USB, Android's `127.0.0.1` points to the phone itself. ADB reverse maps the phone port to the development computer.

## 1. Start the backend

From the project root:

```bat
npm install
npm run dev
```

Confirm the terminal prints that the app is running on port 3000.

## 2. Verify the backend on Windows

Open:

```text
http://127.0.0.1:3000/api/health
```

It should return JSON containing `"status":"ok"`.

## 3. Reverse the port to the connected Android device

```bat
adb -s 193012601220 reverse tcp:3000 tcp:3000
```

To verify:

```bat
adb -s 193012601220 reverse --list
```

You should see `tcp:3000 tcp:3000`.

## 4. Run Flutter

```bat
cd mobile
flutter clean
flutter pub get
flutter run -d 193012601220
```

## Fixed administrator

- Mobile: `+919999999999` (you can also enter `9999999999`)
- Password: `Admin@12345`

These credentials are fixed in the backend code. They are not WhatsApp/automation credentials. Each approved business user must enter their own WhatsApp credentials after login.

## Emulator note

If using an Android emulator instead of a physical device, run Flutter with:

```bat
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

## Production

Use your HTTPS API domain:

```bat
flutter build apk --dart-define=API_BASE_URL=https://api.yourdomain.com
```
