import 'dart:io';
import '../lib/models/models.dart';

void require(bool condition, String label) {
  if (!condition) throw StateError('FAILED: $label');
  stdout.writeln('PASS: $label');
}

void main() {
  final item = Automation.fromJson({
    'id': 1,
    'scheduledAt': '2026-10-05T12:00:00Z',
    'status': 'SENT',
    'variables': {
      'customer': 'Rahul',
      'header_customer': 'Business',
      '__send_now': 'true',
    },
    'templateSnapshot': {
      'components': [
        {'type': 'BODY', 'text': 'Hello {{customer}}, your order is ready.'},
      ],
    },
    'templateComponents': [
      {'type': 'BODY', 'text': 'This template was edited afterwards.'},
    ],
  });
  require(
    item.messagePreview == 'Hello Rahul, your order is ready.',
    'Preview uses historical text and actual recipient variables',
  );
  require(
    item.sentNow,
    'Send Now activity is recognizable in scheduled messages',
  );
  final template = MessageTemplate.fromJson({
    'id': 1,
    'name': 'order',
    'status': 'APPROVED',
    'metaTemplateId': '123',
    'components': [
      {
        'type': 'HEADER',
        'format': 'TEXT',
        'text': 'Order {{order_id}}',
        'example': {
          'header_text_named_params': [
            {'param_name': 'order_id', 'example': '1042'},
          ],
        },
      },
      {
        'type': 'BODY',
        'text': 'Hello {{customer}}, your order is ready.',
        'example': {
          'body_text_named_params': [
            {'param_name': 'customer', 'example': 'Rahul'},
          ],
        },
      },
      {
        'type': 'BUTTONS',
        'buttons': [
          {
            'type': 'URL',
            'text': 'Open order',
            'url': 'https://example.com/order/{{1}}',
            'example': ['https://example.com/order/1042'],
          },
        ],
      },
    ],
  });
  require(
    template.metaTemplateId == '123',
    'Approved template retains Meta identity for editing',
  );
  require(
    template.variableRequirements[0]['sample'] == '1042' &&
        template.variableRequirements[1]['sample'] == 'Rahul',
    'Named header/body samples remain understandable',
  );
  require(
    template.variableRequirements[2]['token'] == 'button_0_1' &&
        template.variableRequirements[2]['sample'] == '1042',
    'Existing dynamic URL templates request the required button value',
  );
}
