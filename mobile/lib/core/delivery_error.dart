const marketingRecipientLimitMessage =
    'WhatsApp restricted this marketing message for this recipient (#131049). '
    'Wait at least 24 hours after the last restriction before trying again. '
    'Delivery after that is still subject to Meta limits. Other recipients can continue.';

String deliveryError(Object? value, [Object? code]) {
  final text = (value?.toString() ?? '').trim();
  if (code?.toString() == '131049' ||
      text.contains('131049') ||
      text.toLowerCase().contains('healthy ecosystem engagement')) {
    return marketingRecipientLimitMessage;
  }
  return text;
}
