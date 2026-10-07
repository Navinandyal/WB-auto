class AiPromptGuide {
  static const purposes = {
    'BIRTHDAY': 'Birthday',
    'CAMPAIGN': 'Campaign',
    'MARKETING': 'Marketing offer',
    'FESTIVAL': 'Festival greeting',
    'REMINDER': 'Customer reminder',
    'OTHER': 'Other',
  };
  static const recipientTypes = [
    'Student',
    'Parent',
    'Teacher',
    'Principal',
    'Management',
    'Corporate Client',
    'Counsellor',
    'Friend',
    'Customer',
  ];
  static const tones = ['Professional', 'Friendly', 'Inspirational'];
  static String purposeCode(String value) {
    final normalized = value.trim().toLowerCase();
    for (final entry in purposes.entries) {
      if (entry.key.toLowerCase() == normalized ||
          entry.value.toLowerCase() == normalized)
        return entry.key;
    }
    return 'OTHER';
  }

  static String purposeLabel(String value) => purposes[value] ?? value.trim();

  static String example(String purpose, String business) {
    final label = purposeLabel(purpose);
    purpose = purposeCode(purpose);
    if (purpose == 'BIRTHDAY')
      return 'You are an AI content writer representing $business. Create a warm, inspiring birthday message of 60–120 words, within WhatsApp’s 1,024-character body limit. Use the recipient’s name as a reusable customer-name variable. Encourage happiness, confidence, learning, health, growth and future success. Adapt the message for a student, parent, teacher, principal, corporate client, counsellor or friend according to the selected recipient type. Avoid repetitive birthday quotes. Use only the details I provide. End with:\nWarm Regards,\nTeam $business';
    if (purpose == 'CAMPAIGN')
      return 'Represent $business and write one clear WhatsApp campaign message. Explain the campaign goal and benefit for the selected audience. Use only the offer, dates, achievement and call to action I provide. Do not invent prices, promises or urgency. Keep it friendly and easy to act on.';
    if (purpose == 'MARKETING')
      return 'Represent $business and write a concise WhatsApp marketing message. Introduce the supplied offer, explain its benefit and include the supplied next step. Personalize it with a reusable customer-name variable. Avoid exaggerated claims and invented discounts.';
    if (purpose == 'FESTIVAL')
      return 'Represent $business and write a thoughtful festival greeting in the selected language. Use the festival I provide, a warm tone and a reusable customer-name variable. Include an offer only when I explicitly supply it.';
    if (purpose == 'REMINDER')
      return 'Represent $business and write a reminder about the specific customer appointment, order or request I provide. Mention only supplied dates and actions. Keep it clear and respectful, without promotions.';
    return 'Represent $business and write one WhatsApp template for $label using my supplied details and selected language, tone and attachment preference. Do not invent facts.';
  }

  static String prompt({
    required String purpose,
    required String business,
    required Map<String, String> details,
    required String note,
    bool revision = false,
  }) {
    final lines = details.entries
        .where((e) => e.value.trim().isNotEmpty)
        .map((e) => '${e.key}: ${e.value.trim()}')
        .join('\n');
    return 'Purpose: ${purposeLabel(purpose)}\n${revision ? 'Revise the current edited template. Follow changed guided options and my change note; otherwise preserve the edited details.' : example(purpose, business)}\n$lines${note.trim().isEmpty ? '' : '\n${revision ? 'Change note' : 'Additional instructions'}: ${note.trim()}'}';
  }
}
