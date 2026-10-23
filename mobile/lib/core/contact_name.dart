/// Sentence case for a contact, e.g. RAHUL SHARMA -> Rahul sharma.
String contactName(Object? value) {
  final letters = (value?.toString() ?? '').trim().toLowerCase().runes.toList();
  if (letters.isEmpty) return '';
  return String.fromCharCode(letters.first).toUpperCase() +
      String.fromCharCodes(letters.skip(1));
}
