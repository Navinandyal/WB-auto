import Flutter
import UIKit
import LocalAuthentication
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var authenticationContext: LAContext?
  private var biometricChannel: FlutterMethodChannel?
  private var notificationChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let messenger = engineBridge.applicationRegistrar.messenger()
    biometricChannel = FlutterMethodChannel(name: "wishflow/biometric", binaryMessenger: messenger)
    biometricChannel?.setMethodCallHandler { [weak self] call, result in
      guard let self = self else { result(false); return }
      switch call.method {
      case "isAvailable":
        var error: NSError?
        result(LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error))
      case "authenticate":
        if self.authenticationContext != nil { result(false); return }
        let arguments = call.arguments as? [String: Any]
        let reason = arguments?["reason"] as? String ?? "Sign in securely to GreetSync"
        let context = LAContext()
        context.localizedFallbackTitle = "Use password"
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
          result(false); return
        }
        self.authenticationContext = context
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, _ in
          DispatchQueue.main.async {
            self.authenticationContext = nil
            result(success)
          }
        }
      default: result(FlutterMethodNotImplemented)
      }
    }
    notificationChannel = FlutterMethodChannel(name: "greetsync/notifications", binaryMessenger: messenger)
    notificationChannel?.setMethodCallHandler { [weak self] call, result in
      guard let self = self else { result(false); return }
      self.handleNotification(call, result: result)
    }
  }

  private func handleNotification(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let center = UNUserNotificationCenter.current()
    let arguments = call.arguments as? [String: Any] ?? [:]
    switch call.method {
    case "requestPermission":
      center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
        DispatchQueue.main.async {
          if let error = error { result(FlutterError(code: "NOTIFICATION_PERMISSION", message: error.localizedDescription, details: nil)) }
          else { result(granted) }
        }
      }
    case "show", "schedule":
      let id = (arguments["id"] as? NSNumber)?.intValue ?? 0
      let reminder = call.method == "schedule"
      let epoch = (arguments["epochMillis"] as? NSNumber)?.doubleValue
      if reminder && (epoch == nil || !epoch!.isFinite) {
        result(FlutterError(code: "INVALID_DATE", message: "A reminder needs a valid date.", details: nil)); return
      }
      let request = makeNotification(id: id, arguments: arguments, reminder: reminder)
      center.add(request) { error in
        DispatchQueue.main.async {
          if let error = error { result(FlutterError(code: "NOTIFICATION_FAILED", message: error.localizedDescription, details: nil)) }
          else { result(true) }
        }
      }
    case "syncSchedules":
      let items = arguments["items"] as? [[String: Any]] ?? []
      // Keep the closest 50 reminders and leave capacity for immediate alerts.
      let now = Date().timeIntervalSince1970 * 1000
      let future = items.filter { item in
        guard let time = (item["epochMillis"] as? NSNumber)?.doubleValue else { return false }
        return time.isFinite && time > now
      }.sorted { ($0["epochMillis"] as! NSNumber).doubleValue < ($1["epochMillis"] as! NSNumber).doubleValue }
      center.getPendingNotificationRequests { requests in
        center.removePendingNotificationRequests(withIdentifiers: requests.filter { $0.identifier.hasPrefix("greetsync.reminder.") }.map { $0.identifier })
        let group = DispatchGroup()
        let lock = NSLock()
        var firstError: String?
        for item in future.prefix(50) {
          group.enter()
          let id = (item["id"] as? NSNumber)?.intValue ?? 0
          center.add(self.makeNotification(id: id, arguments: item, reminder: true)) { error in
            if let error = error { lock.lock(); firstError = firstError ?? error.localizedDescription; lock.unlock() }
            group.leave()
          }
        }
        group.notify(queue: .main) {
          if let error = firstError { result(FlutterError(code: "REMINDER_FAILED", message: error, details: nil)) }
          else { result(true) }
        }
      }
    case "cancel":
      let id = (arguments["id"] as? NSNumber)?.intValue ?? 0
      let identifiers = ["greetsync.local.\(id)", "greetsync.reminder.\(id)"]
      center.removePendingNotificationRequests(withIdentifiers: identifiers)
      center.removeDeliveredNotifications(withIdentifiers: identifiers)
      result(true)
    default: result(FlutterMethodNotImplemented)
    }
  }

  private func makeNotification(id: Int, arguments: [String: Any], reminder: Bool) -> UNNotificationRequest {
    let content = UNMutableNotificationContent()
    content.title = arguments["title"] as? String ?? "GreetSync"
    content.body = arguments["body"] as? String ?? ""
    content.sound = .default
    let epoch = (arguments["epochMillis"] as? NSNumber)?.doubleValue ?? 0
    let interval = reminder ? max(1, epoch / 1000 - Date().timeIntervalSince1970) : 1
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
    let prefix = reminder ? "greetsync.reminder." : "greetsync.local."
    return UNNotificationRequest(identifier: prefix + String(id), content: content, trigger: trigger)
  }

  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    if notification.request.identifier.hasPrefix("greetsync.") {
      completionHandler([.banner, .sound])
    } else {
      // Preserve FlutterFire's foreground-message handling for remote pushes.
      super.userNotificationCenter(center, willPresent: notification, withCompletionHandler: completionHandler)
    }
  }
}
