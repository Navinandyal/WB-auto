import 'dart:io';
import '../lib/core/contact_name.dart';
import '../lib/core/delivery_error.dart';
import '../lib/models/models.dart';

void check(bool condition, String label) {
  if (!condition) throw StateError(label);
  stdout.writeln('PASS: $label');
}

void main() {
  for (final pair in [
    [' RAHUL SHARMA ', 'Rahul sharma'],
    ['ÉLODIE DUPONT', 'Élodie dupont'],
    ['अमित पाटील', 'अमित पाटील'],
    ["ANNE-MARIE O'NEILL", "Anne-marie o'neill"],
    ['', ''],
  ]) {
    check(contactName(pair[0]) == pair[1], 'Contact name ${pair[0]}');
  }
  final contact = Contact.fromJson({
    'id': 1,
    'name': 'JOHN DOE',
    'phone': '+919876543210',
  });
  check(
    contact.name == 'John doe',
    'Previously saved names display in sentence case',
  );
  check(
    deliveryError('Old repeated error', '131049') ==
        marketingRecipientLimitMessage,
    'Meta restriction has one explanation',
  );
  check(
    deliveryError(
          'This message was not delivered to maintain healthy ecosystem engagement: repeated text',
        ) ==
        marketingRecipientLimitMessage,
    'Old saved Meta errors are readable',
  );
  check(
    deliveryError('PDF could not be processed', '131053') ==
        'PDF could not be processed',
    'Other real errors remain intact',
  );
  final queued = Automation.fromJson({
    'id': 1,
    'status': 'SCHEDULED',
    'contactName': 'JOHN DOE',
    'scheduledAt': '2026-10-22T12:00:00Z',
    'variables': {'__send_now': 'true'},
  });
  check(
    queued.sentNow && queued.status == 'SCHEDULED',
    'Send Now remains distinguishable while queued',
  );
  check(
    queued.contactName == 'John doe',
    'Automation recipient uses the same name style',
  );
}
