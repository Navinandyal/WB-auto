# Android build toolchain fix

Updated Android build tooling to satisfy the current AndroidX dependencies used by the Flutter app.

- Android Gradle Plugin: 8.11.1
- Gradle wrapper: 8.14.3
- Kotlin Gradle Plugin: 2.2.20
- Java/Kotlin JVM target: 17

The previous build used AGP 8.7.3, while androidx.browser 1.9.0 and androidx.core 1.17.0 require AGP 8.9.1 or newer.

After replacing the project run:

```bat
cd D:\Aikyam\project\mobile
flutter clean
flutter pub get
cd android
gradlew --stop
cd ..
flutter run -d 193012601220 --dart-define=API_BASE_URL=http://127.0.0.1:3000
```

Or use `run-greetsync-android-dev.cmd`.
