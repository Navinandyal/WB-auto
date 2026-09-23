import 'package:flutter/material.dart';
import 'home_shell.dart';

/// Legacy compatibility wrapper.
/// WhatsApp verification is intentionally NOT an application-login gate.
/// Approved users always enter the business app; WhatsApp is connected from the dashboard/settings.
class BusinessCredentialGate extends StatelessWidget {
  const BusinessCredentialGate({super.key});
  @override
  Widget build(BuildContext context) => const HomeShell();
}
