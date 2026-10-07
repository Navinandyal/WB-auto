/// Sent means WhatsApp accepted the request. Receipt states remain in backend
/// records, so a later failure still replaces this display state.
String messageStatus(
  String status, [
  Map<dynamic, dynamic> variables = const {},
]) {
  if (status == 'ACCEPTED' && variables['__meta_message_status'] == 'unknown')
    return 'PROCESSING';
  if (['ACCEPTED', 'SENT', 'DELIVERED', 'READ'].contains(status)) return 'SENT';
  if (status == 'SCHEDULED') return 'QUEUE';
  return status;
}
