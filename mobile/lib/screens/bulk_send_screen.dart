import 'package:flutter/material.dart';
import 'create_automation_screen.dart';

/// All bulk sends share the same template, media, audience and review composer.
class BulkSendScreen extends StatelessWidget {
  const BulkSendScreen({
    super.key,
    this.preselectedContactIds = const [],
    this.preferredTemplateId,
  });
  final List<int> preselectedContactIds;
  final int? preferredTemplateId;

  @override
  Widget build(BuildContext context) => CreateAutomationScreen(
    initialMode: 1,
    initialSendNow: true,
    preselectedContactIds: preselectedContactIds,
    preferredTemplateId: preferredTemplateId,
  );
}
