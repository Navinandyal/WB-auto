import 'dart:convert';

/// Device-only drafts. Backend, business ID and UID form the storage scope.
/// Saving here never invokes the contact, schedule or message APIs.
class EditorDraftStore {
  EditorDraftStore({
    required this.scope,
    required this.read,
    required this.write,
    required this.delete,
  });
  final String scope;
  final Future<String?> Function(String key) read;
  final Future<void> Function(String key, String value) write;
  final Future<void> Function(String key) delete;
  String key(String kind) =>
      'greetsync_editor_v1_${Uri.encodeComponent(scope)}_${Uri.encodeComponent(kind)}';
  Future<Map<String, dynamic>?> load(String kind) async {
    final value = await read(key(kind));
    if (value == null) return null;
    final decoded = jsonDecode(value);
    if (decoded is! Map ||
        decoded['version'] != 1 ||
        decoded['kind'] != kind ||
        decoded['payload'] is! Map)
      throw const FormatException('This saved draft cannot be restored.');
    return (decoded['payload'] as Map).cast<String, dynamic>();
  }

  Future<void> save(String kind, Map<String, dynamic> payload) async {
    final value = jsonEncode({
      'version': 1,
      'kind': kind,
      'savedAt': DateTime.now().toUtc().toIso8601String(),
      'payload': payload,
    });
    if (utf8.encode(value).length > 25 * 1024 * 1024)
      throw const FormatException(
        'Draft is too large to save. Remove the large attachment and try again.',
      );
    await write(key(kind), value);
  }

  Future<void> remove(String kind) => delete(key(kind));
}
