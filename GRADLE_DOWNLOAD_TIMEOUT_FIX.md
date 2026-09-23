# Gradle download timeout fix

The Android wrapper now downloads Gradle 8.14.3 directly from `downloads.gradle.org` instead of `services.gradle.org` (which redirects and was timing out on the user's machine).

`networkTimeout` is increased from 10 seconds to 120 seconds.

If a corporate firewall/proxy still blocks Gradle downloads, download `gradle-8.14.3-bin.zip` once from https://downloads.gradle.org/distributions/gradle-8.14.3-bin.zip and place it in the Gradle wrapper cache, or configure the system proxy.
