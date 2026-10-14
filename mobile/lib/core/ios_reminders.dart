import '../models/models.dart';

/// iOS has limited local-notification capacity. Keep the nearest reminders;
/// the server remains responsible for sending every scheduled WhatsApp message.
List<Map<String, dynamic>> iosReminderEntries(
  List<Automation> automations,
  DateTime now,
) {
  final upcoming =
      automations
          .where(
            (item) =>
                item.status == 'SCHEDULED' && item.scheduledAt.isAfter(now),
          )
          .toList()
        ..sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));
  return upcoming
      .take(50)
      .map(
        (item) => <String, dynamic>{
          'id': 200000 + item.id,
          'title': 'Scheduled message',
          'body':
              '${item.templateName} to ${item.contactName} is due now. GreetSync will refresh the delivery status automatically.',
          'epochMillis': item.scheduledAt.millisecondsSinceEpoch,
        },
      )
      .toList();
}
