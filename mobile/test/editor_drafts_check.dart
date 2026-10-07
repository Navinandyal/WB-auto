import 'dart:convert';
import '../lib/core/editor_drafts.dart';
import '../lib/core/ai_prompt_guide.dart';

Future<void> main() async {
  final memory = <String, String>{};
  var checks = 0;
  void check(bool condition, String description) {
    if (!condition) throw StateError(description);
    checks++;
  }

  EditorDraftStore store(String scope) => EditorDraftStore(
    scope: scope,
    read: (key) async => memory[key],
    write: (key, value) async {
      memory[key] = value;
    },
    delete: (key) async {
      memory.remove(key);
    },
  );
  final own = store('https://backend:1:owner-one'),
      other = store('https://backend:2:owner-two'),
      otherBackend = store('https://other:1:owner-one');
  await own.save('template:new', {
    'name': '',
    'body': 'unfinished',
    'aiPrompt': 'मराठी birthday',
    'mediaBase64': base64Encode([1, 2, 3]),
    'locationName': 'Partially selected place',
  });
  final template = await own.load('template:new');
  check(template?['body'] == 'unfinished', 'Partial template survives');
  check(
    template?['aiPrompt'] == 'मराठी birthday',
    'Unicode instructions survive',
  );
  check(template?['mediaBase64'] == 'AQID', 'Selected media bytes survive');
  check(
    template?['locationName'] == 'Partially selected place',
    'Partial map data survives',
  );
  check(
    await other.load('template:new') == null,
    'Different business cannot restore this draft',
  );
  check(
    await otherBackend.load('template:new') == null,
    'Different backend cannot restore this draft',
  );
  await own.save('contact:new', {'name': '', 'phone': '+91', 'optIn': false});
  check(
    (await own.load('contact:new'))?['phone'] == '+91',
    'Partial contact can be saved without server validation',
  );
  check(
    (await own.load('contact:new'))?['optIn'] == false,
    'Consent choice survives',
  );
  await own.save('message:new', {
    'requestId': 'send_original_attempt',
    'contacts': [10, 11],
    'when': '2026-10-01T10:00:00Z',
    'mediaId': '123',
  });
  final message = await own.load('message:new');
  check(
    message?['requestId'] == 'send_original_attempt',
    'Resuming preserves idempotency request ID',
  );
  check((message?['contacts'] as List).length == 2, 'Audience survives');
  check(
    message?['when'] == '2026-10-01T10:00:00Z',
    'Date is preserved for review, never executed by the draft store',
  );
  await own.remove('template:new');
  check(
    await own.load('template:new') == null,
    'Discard removes selected draft',
  );
  check(
    await own.load('contact:new') != null,
    'Discard preserves other editor drafts',
  );
  final savedContact = await own.load('contact:new');
  final failing = EditorDraftStore(
    scope: own.scope,
    read: own.read,
    write: (key, value) async => throw StateError('Storage unavailable'),
    delete: own.delete,
  );
  try {
    await failing.save('contact:new', {'name': 'New'});
    throw StateError('Expected write failure');
  } catch (e) {
    check(
      e.toString().contains('Storage unavailable'),
      'Write failure is propagated',
    );
  }
  check(
    jsonEncode(await own.load('contact:new')) == jsonEncode(savedContact),
    'Failed write preserves the previous saved draft',
  );
  memory[own.key('broken')] = '{"version":2,"kind":"broken","payload":{}}';
  try {
    await own.load('broken');
    throw StateError('Expected invalid draft');
  } on FormatException {
    check(
      memory.containsKey(own.key('broken')),
      'Unsupported draft is not silently deleted',
    );
  }
  try {
    await own.save('oversize', {'media': 'x' * (25 * 1024 * 1024)});
    throw StateError('Expected size rejection');
  } on FormatException {
    check(
      await own.load('oversize') == null,
      'Oversized draft does not write incomplete data',
    );
  }
  final prompt = AiPromptGuide.prompt(
    purpose: 'BIRTHDAY',
    business: 'Brain Educational Consultancy',
    details: {'Recipient type': 'Student', 'Name': 'Navin'},
    note: 'Make it encouraging',
  );
  check(
    prompt.contains('60–120') &&
        prompt.contains('Team Brain Educational Consultancy'),
    'Birthday example follows supplied guidance',
  );
  final revised = AiPromptGuide.prompt(
    purpose: 'CAMPAIGN',
    business: 'Shop',
    details: {'Offer': 'Supplied offer'},
    note: 'Make it shorter',
    revision: true,
  );
  check(
    revised.contains('edited') && revised.contains('Make it shorter'),
    'Revisions preserve edit context and include the change note',
  );
  check(
    AiPromptGuide.purposeCode('Birthday') == 'BIRTHDAY',
    'Suggested labels preserve birthday guidance',
  );
  check(
    AiPromptGuide.purposeCode('Annual alumni reunion') == 'OTHER',
    'Custom purposes use flexible guidance',
  );
  check(
    AiPromptGuide.prompt(
      purpose: 'Annual alumni reunion',
      business: 'Shop',
      details: {'Tone': 'Warm', 'Audience': 'Alumni'},
      note: '',
    ).contains('Annual alumni reunion'),
    'Custom purpose is included in the AI request',
  );
  print('PASS: $checks editor draft and guided-prompt checks');
}
