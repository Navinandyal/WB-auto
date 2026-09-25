package com.aikyam.whatsappautomation

import android.app.KeyguardManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.hardware.fingerprint.FingerprintManager
import android.net.Uri
import android.os.Build
import android.os.CancellationSignal
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val browserChannel = "wishflow/browser"
    private val biometricChannel = "wishflow/biometric"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, browserChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "openChrome" -> {
                        val url = call.argument<String>("url")?.trim().orEmpty()
                        if (url.isEmpty()) {
                            result.error("INVALID_URL", "Missing URL", null)
                            return@setMethodCallHandler
                        }
                        try {
                            val chromeIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                                setPackage("com.android.chrome")
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                            startActivity(chromeIntent)
                            result.success(true)
                        } catch (_: ActivityNotFoundException) {
                            try {
                                val fallback = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                }
                                startActivity(fallback)
                                result.success(false)
                            } catch (e: Exception) {
                                result.error("BROWSER_OPEN_FAILED", e.message, null)
                            }
                        }
                    }
                    else -> result.notImplemented()
                }
            }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, biometricChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "isAvailable" -> result.success(isBiometricAvailable())
                    "authenticate" -> {
                        val reason = call.argument<String>("reason")?.trim().orEmpty().ifEmpty { "Authenticate to continue to WishFlow" }
                        authenticateWithBiometrics(reason, result)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    @Suppress("DEPRECATION")
    private fun isBiometricAvailable(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val manager = getSystemService(BIOMETRIC_SERVICE) as BiometricManager
                manager.canAuthenticate() == BiometricManager.BIOMETRIC_SUCCESS
            } else {
                val fingerprint = getSystemService(FINGERPRINT_SERVICE) as FingerprintManager
                fingerprint.isHardwareDetected && fingerprint.hasEnrolledFingerprints()
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun authenticateWithBiometrics(reason: String, result: MethodChannel.Result) {
        if (!isBiometricAvailable() || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            result.success(false)
            return
        }
        val keyguard = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
        if (!keyguard.isKeyguardSecure) {
            result.success(false)
            return
        }

        val executor = mainExecutor
        var completed = false
        fun complete(value: Boolean) {
            if (!completed) {
                completed = true
                result.success(value)
            }
        }

        try {
            val prompt = BiometricPrompt.Builder(this)
                .setTitle("WishFlow")
                .setSubtitle(reason)
                .setNegativeButton("Use password", executor) { _, _ -> complete(false) }
                .build()

            prompt.authenticate(
                CancellationSignal(),
                executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(authenticationResult: BiometricPrompt.AuthenticationResult?) {
                        super.onAuthenticationSucceeded(authenticationResult)
                        complete(true)
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) {
                        super.onAuthenticationError(errorCode, errString)
                        complete(false)
                    }

                    override fun onAuthenticationFailed() {
                        super.onAuthenticationFailed()
                        // Keep the prompt open so the user can try again.
                    }
                }
            )
        } catch (_: Exception) {
            complete(false)
        }
    }
}
