# Gradle Offline/Cache Fix

The previous build failed before compilation because Gradle 8.14.3 could not be downloaded from the network.

This build intentionally returns to the previously-used local toolchain:

- Gradle 8.9
- Android Gradle Plugin 8.7.3
- Kotlin 2.1.0
- Java/Kotlin JVM target 17

To keep the Meta browser launch feature while remaining compatible with AGP 8.7.3, AndroidX is pinned to:

- `androidx.browser:browser:1.8.0`
- `androidx.core:core:1.15.0`
- `androidx.core:core-ktx:1.15.0`

These avoid the AndroidX 1.9.0/1.17.0 AAR requirement for AGP 8.9.1+.

Because this project previously built with Gradle 8.9 on the same development machine, the wrapper should reuse the existing `%USERPROFILE%\.gradle\wrapper\dists` cache rather than downloading Gradle 8.14.3.

Recommended after replacing the project:

```bat
cd D:\Aikyam\project\mobile
flutter clean
flutter pub get
cd android
gradlew --stop
cd ..
flutter run -d 193012601220 --dart-define=API_BASE_URL=http://127.0.0.1:3000
```

If Windows still tries to download Gradle 8.9, inspect `%USERPROFILE%\.gradle\wrapper\dists\gradle-8.9-bin`. If that cache folder has been deleted, the Gradle distribution must be restored once from another machine or a manual ZIP copy.
