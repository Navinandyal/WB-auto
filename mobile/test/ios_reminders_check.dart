// Run without Flutter engine: dart run test/ios_reminders_check.dart
import '../lib/core/ios_reminders.dart';
import '../lib/models/models.dart';

void main() {
  final now = DateTime.utc(2026, 10, 7, 12);
  Automation item(int id, int minutes, [String status = 'SCHEDULED']) =>
      Automation.fromJson({
        'id': id,
        'status': status,
        'scheduledAt': now.add(Duration(minutes: minutes)).toIso8601String(),
        'contactName': 'Contact $id',
        'templateName': 'Birthday',
      });
  void check(bool condition, String message) {
    if (!condition) throw StateError(message);
  }

  final entries = iosReminderEntries([
    item(1, -1),
    item(2, 0),
    item(3, 1, 'SENT'),
    item(4, 1, 'FAILED'),
    for (var id = 60; id >= 5; id--) item(id, id),
  ], now);
  check(entries.length == 50, 'Respect local reminder capacity');
  check(
    entries.first['id'] == 200005,
    'Filter completed/past and sort nearest first',
  );
  check(entries.last['id'] == 200054, 'Keep nearest fifty');
  check(
    entries.first['epochMillis'] ==
        now.add(const Duration(minutes: 5)).millisecondsSinceEpoch,
    'Preserve UTC instant',
  );
  check(
    entries.first['body'].contains('Birthday to Contact 5'),
    'Use contact and template',
  );
  check(
    iosReminderEntries([], now).isEmpty,
    'An empty list clears pending reminders',
  );
  print('iOS reminders: 6 checks passed');
}
