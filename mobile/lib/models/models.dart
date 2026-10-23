import '../core/delivery_error.dart';
import '../core/contact_name.dart' as contact_names;
import 'dart:convert';

int _i(dynamic v, [int d = 0]) => v is int ? v : int.tryParse('$v') ?? d;
bool _b(dynamic v, [bool d = false]) => v is bool ? v : d;
String _s(dynamic v, [String d = '']) => v?.toString() ?? d;

List<dynamic> _jsonList(dynamic value) {
  if (value is List) return value;
  if (value is String && value.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is List) return decoded;
    } catch (_) {}
  }
  return const [];
}

class AppUser {
  AppUser({
    required this.id,
    required this.uid,
    required this.mobile,
    required this.email,
    required this.name,
    required this.role,
    required this.businessName,
    required this.businessAddress,
    required this.approvalStatus,
    this.businessLogoData,
  });
  final int id;
  final String uid,
      mobile,
      email,
      name,
      role,
      businessName,
      businessAddress,
      approvalStatus;
  final String? businessLogoData;
  bool get isAdmin => role == 'admin';
  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
    id: _i(j['id']),
    uid: _s(j['uid']),
    mobile: _s(j['phone'] ?? j['mobile']),
    email: _s(j['email']),
    name: _s(j['name']),
    role: _s(j['role'], 'business_user'),
    businessName: _s(j['businessName'] ?? j['business_name']),
    businessAddress: _s(j['businessAddress'] ?? j['business_address']),
    approvalStatus: _s(j['approvalStatus'] ?? j['approval_status'], 'ACTIVE'),
    businessLogoData: (j['businessLogoData'] ?? j['business_logo_data'])
        ?.toString(),
  );
}

class BusinessUser {
  BusinessUser({
    required this.id,
    required this.uid,
    required this.mobile,
    required this.email,
    required this.name,
    required this.role,
    required this.isActive,
    required this.businessName,
    required this.businessAddress,
    required this.approvalStatus,
    this.createdAt,
    this.lastLoginAt,
  });
  final int id;
  final String uid,
      mobile,
      email,
      name,
      role,
      businessName,
      businessAddress,
      approvalStatus;
  final bool isActive;
  final DateTime? createdAt, lastLoginAt;
  bool get isPending =>
      approvalStatus == 'PENDING' || approvalStatus == 'PENDING_APPROVAL';
  bool get isApproved =>
      approvalStatus == 'APPROVED' || approvalStatus == 'ACTIVE';
  bool get isRejected => approvalStatus == 'REJECTED';
  bool get isSuspended => approvalStatus == 'SUSPENDED';
  factory BusinessUser.fromJson(Map<String, dynamic> j) => BusinessUser(
    id: _i(j['id']),
    uid: _s(j['uid']),
    mobile: _s(j['phone'] ?? j['mobile']),
    email: _s(j['email']),
    name: _s(j['name']),
    role: _s(j['role'], 'business_user'),
    isActive: _b(j['isActive'] ?? j['is_active'], true),
    businessName: _s(j['businessName'] ?? j['business_name']),
    businessAddress: _s(j['businessAddress'] ?? j['business_address']),
    approvalStatus: _s(
      j['approvalStatus'] ?? j['approval_status'],
      'PENDING_APPROVAL',
    ),
    createdAt: DateTime.tryParse(_s(j['createdAt'] ?? j['created_at'])),
    lastLoginAt: DateTime.tryParse(_s(j['lastLoginAt'] ?? j['last_login_at'])),
  );
}

class AdminOverview {
  AdminOverview({
    required this.totalBusinesses,
    required this.pendingApprovals,
    required this.totalContacts,
    required this.totalAutomations,
    required this.totalMessages,
  });
  final int totalBusinesses,
      pendingApprovals,
      totalContacts,
      totalAutomations,
      totalMessages;
  factory AdminOverview.fromJson(Map<String, dynamic> j) => AdminOverview(
    totalBusinesses: _i(j['totalBusinesses']),
    pendingApprovals: _i(j['pendingApprovals']),
    totalContacts: _i(j['totalContacts']),
    totalAutomations: _i(j['totalAutomations']),
    totalMessages: _i(j['totalMessages']),
  );
}

class Contact {
  Contact({
    required this.id,
    required this.name,
    required this.phone,
    required this.optIn,
    this.email,
    this.dob,
    required this.birthdayAutomationEnabled,
    this.notes,
    this.avatarData,
    this.groupIds = const [],
  });
  final int id;
  final String name, phone;
  final bool optIn, birthdayAutomationEnabled;
  final String? email, dob, notes, avatarData;
  final List<int> groupIds;

  factory Contact.fromJson(Map<String, dynamic> j) => Contact(
    id: _i(j['id']),
    name: contact_names.contactName(j['name']),
    phone: _s(j['phone']),
    optIn: _b(j['optIn'] ?? j['opt_in'], true),
    email: j['email']?.toString(),
    dob: j['dob']?.toString(),
    birthdayAutomationEnabled: _b(
      j['birthdayAutomationEnabled'] ?? j['birthday_automation_enabled'],
      true,
    ),
    notes: j['notes']?.toString(),
    avatarData: (j['avatarData'] ?? j['avatar_data'])?.toString(),
    groupIds: ((j['groupIds'] ?? j['group_ids']) is List)
        ? ((j['groupIds'] ?? j['group_ids']) as List)
              .map((e) => _i(e))
              .where((e) => e > 0)
              .toList()
        : const [],
  );
}

class ContactGroup {
  ContactGroup({
    required this.id,
    required this.name,
    required this.memberCount,
    this.description,
  });
  final int id, memberCount;
  final String name;
  final String? description;
  factory ContactGroup.fromJson(Map<String, dynamic> j) => ContactGroup(
    id: _i(j['id']),
    name: _s(j['name']),
    memberCount: _i(j['memberCount'] ?? j['member_count']),
    description: j['description']?.toString(),
  );
}

class MessageTemplate {
  MessageTemplate({
    required this.id,
    required this.name,
    required this.language,
    required this.category,
    required this.status,
    required this.variableCount,
    required this.components,
    this.displayName,
    this.metaTemplateId,
  });
  final int id, variableCount;
  final String name, language, category, status;
  final String? displayName, metaTemplateId;
  final List<dynamic> components;
  factory MessageTemplate.fromJson(Map<String, dynamic> j) => MessageTemplate(
    id: _i(j['id']),
    name: _s(j['name']),
    displayName: (j['displayName'] ?? j['display_name'])?.toString(),
    metaTemplateId: (j['metaTemplateId'] ?? j['meta_template_id'])?.toString(),
    language: _s(j['language']),
    category: _s(j['category']),
    status: _s(j['status']),
    variableCount: _i(j['variableCount'] ?? j['variable_count']),
    components: _jsonList(j['components']),
  );

  String get displayTitle {
    final custom = (displayName ?? '').trim();
    if (custom.isNotEmpty) return custom;
    final n = name.toLowerCase();
    if (n == 'hello_world' || n == 'hello world') return 'Hello World';
    if (n.contains('birthday')) return 'Birthday';
    return name;
  }

  String get languageLabel {
    switch (language.toLowerCase()) {
      case 'en_us':
        return 'English (US)';
      case 'en_gb':
        return 'English (UK)';
      case 'en':
        return 'English';
      case 'hi':
        return 'Hindi';
      case 'mr':
        return 'Marathi';
      default:
        return language.replaceAll('_', '-');
    }
  }

  List<String> get headerVariableTokens {
    final seen = <String>{};
    for (final match in RegExp(
      r'\{\{\s*([^{}]+?)\s*\}\}',
    ).allMatches(headerText)) {
      final token = (match.group(1) ?? '').trim();
      if (token.isNotEmpty) seen.add(token);
    }
    return seen.toList();
  }

  List<String> get bodyVariableTokens {
    final seen = <String>{};
    for (final match in RegExp(
      r'\{\{\s*([^{}]+?)\s*\}\}',
    ).allMatches(bodyText)) {
      final token = (match.group(1) ?? '').trim();
      if (token.isNotEmpty) seen.add(token);
    }
    return seen.toList();
  }

  List<Map<String, String>> get variableRequirements {
    final requirements = <Map<String, String>>[];
    for (final raw in components.whereType<Map>()) {
      final component = raw.cast<dynamic, dynamic>();
      final type = _s(component['type']).toUpperCase();
      if (type != 'HEADER' && type != 'BODY') continue;
      final text = _s(component['text']);
      final tokens = <String>[];
      for (final match in RegExp(r'\{\{\s*([^{}]+?)\s*\}\}').allMatches(text)) {
        final token = (match.group(1) ?? '').trim();
        if (token.isNotEmpty && !tokens.contains(token)) tokens.add(token);
      }
      if (tokens.isEmpty) continue;
      final example = component['example'];
      List<dynamic> samples = const [];
      if (example is Map) {
        if (type == 'HEADER' && example['header_text'] is List) {
          samples = example['header_text'] as List;
        } else if (type == 'BODY' &&
            example['body_text'] is List &&
            (example['body_text'] as List).isNotEmpty &&
            (example['body_text'] as List).first is List) {
          samples = (example['body_text'] as List).first as List;
        }
      }
      final named = example is Map
          ? example[type == 'HEADER'
                ? 'header_text_named_params'
                : 'body_text_named_params']
          : null;
      if (named is List)
        samples = tokens.map((token) {
          for (final sample in named.whereType<Map>()) {
            if ('${sample['param_name']}' == token) return sample['example'];
          }
          return '';
        }).toList();
      final meanings = component['greetsync_variable_meanings'];
      for (var i = 0; i < tokens.length; i++) {
        final token = tokens[i];
        final meaning = meanings is Map
            ? _s(meanings[token], 'CUSTOM')
            : 'CUSTOM';
        requirements.add({
          'section': type,
          'token': token,
          'sample': i < samples.length ? _s(samples[i]) : '',
          'meaning': meaning,
        });
      }
    }
    for (var index = 0; index < buttons.length; index++) {
      final button = buttons[index];
      if (button is! Map || '${button['type']}'.toUpperCase() != 'URL')
        continue;
      final url = '${button['url'] ?? ''}';
      final match = RegExp(r'\{\{\s*([^{}]+?)\s*\}\}').firstMatch(url);
      if (match == null) continue;
      final token = match[1]!.trim();
      final examples = button['example'];
      final full = examples is List && examples.isNotEmpty
          ? '${examples.first}'
          : '';
      final prefix = url.substring(0, match.start);
      requirements.add({
        'section': 'BUTTON',
        'token': 'button_${index}_$token',
        'sample': full.startsWith(prefix) ? full.substring(prefix.length) : '',
        'meaning': 'CUSTOM',
      });
    }
    return requirements;
  }

  List<String> get variableTokens {
    final seen = <String>{};
    for (final text in [headerText, bodyText, footerText]) {
      for (final match in RegExp(r'\{\{\s*([^{}]+?)\s*\}\}').allMatches(text)) {
        final token = (match.group(1) ?? '').trim();
        if (token.isNotEmpty) seen.add(token);
      }
    }
    return seen.toList();
  }

  String? get mediaExampleUrl {
    for (final component in components.whereType<Map>()) {
      if (_s(component['type']).toUpperCase() != 'HEADER') continue;
      final example = component['example'];
      final handles = example is Map ? example['header_handle'] : null;
      if (handles is List) {
        for (final raw in handles) {
          final uri = Uri.tryParse('$raw');
          if (uri != null &&
              (uri.scheme == 'https' || uri.scheme == 'http') &&
              uri.host.isNotEmpty)
            return '$raw';
        }
      }
    }
    return null;
  }

  String get bodyText {
    for (final c in components) {
      if (c is Map && _s(c['type']).toUpperCase() == 'BODY')
        return _s(c['text']);
    }
    return '';
  }

  String get headerText {
    for (final c in components) {
      if (c is Map && _s(c['type']).toUpperCase() == 'HEADER')
        return _s(c['text']);
    }
    return '';
  }

  String get footerText {
    for (final c in components) {
      if (c is Map && _s(c['type']).toUpperCase() == 'FOOTER')
        return _s(c['text']);
    }
    return '';
  }

  Map<String, dynamic>? get headerComponent {
    for (final c in components) {
      if (c is Map && _s(c['type']).toUpperCase() == 'HEADER')
        return c.cast<String, dynamic>();
    }
    return null;
  }

  String get headerFormat =>
      _s(headerComponent?['format'], 'TEXT').toUpperCase();
  bool get hasMediaHeader =>
      const {'IMAGE', 'VIDEO', 'DOCUMENT'}.contains(headerFormat);
  bool get hasLocationHeader => headerFormat == 'LOCATION';

  Map<String, dynamic>? get mediaPreview {
    final raw = headerComponent?['greetsync_media_preview'];
    return raw is Map ? raw.cast<String, dynamic>() : null;
  }

  Map<String, dynamic>? get locationPreview {
    final raw = headerComponent?['greetsync_location'];
    return raw is Map ? raw.cast<String, dynamic>() : null;
  }

  List<dynamic> get buttons {
    for (final c in components) {
      if (c is Map && _s(c['type']).toUpperCase() == 'BUTTONS')
        return _jsonList(c['buttons']);
    }
    return const [];
  }
}

class Automation {
  Automation({
    required this.id,
    required this.contactId,
    required this.templateId,
    required this.variables,
    required this.scheduledAt,
    required this.timezone,
    required this.status,
    this.executedAt,
    this.errorMessage,
    required this.contactName,
    required this.contactPhone,
    required this.contactOptIn,
    required this.templateName,
    required this.templateLanguage,
    required this.templateStatus,
    required this.templateComponents,
  });

  final int id, contactId, templateId;
  final Map<String, String> variables;
  final DateTime scheduledAt;
  final String timezone,
      status,
      contactName,
      contactPhone,
      templateName,
      templateLanguage,
      templateStatus;
  final DateTime? executedAt;
  final String? errorMessage;
  final bool contactOptIn;
  final List<dynamic> templateComponents;

  factory Automation.fromJson(Map<String, dynamic> j) => Automation(
    id: _i(j['id']),
    contactId: _i(j['contactId']),
    templateId: _i(j['templateId']),
    variables: j['variables'] is Map
        ? (j['variables'] as Map).map((k, v) => MapEntry('$k', '$v'))
        : <String, String>{},
    scheduledAt: DateTime.tryParse(_s(j['scheduledAt'])) ?? DateTime.now(),
    timezone: _s(j['timezone'], 'Asia/Kolkata'),
    status: _s(j['status']),
    executedAt: DateTime.tryParse(_s(j['executedAt'])),
    errorMessage: j['errorMessage'] == null
        ? null
        : deliveryError(j['errorMessage']),
    contactName: contact_names.contactName(j['contactName']),
    contactPhone: _s(j['contactPhone']),
    contactOptIn: _b(j['contactOptIn'], true),
    templateName: _s(j['templateName']),
    templateLanguage: _s(j['templateLanguage']),
    templateStatus: _s(j['templateStatus']),
    templateComponents: _jsonList(
      j['templateSnapshot'] is Map
          ? (j['templateSnapshot'] as Map)['components'] ??
                j['templateComponents']
          : j['templateComponents'],
    ),
  );

  bool get sentNow => (variables['__send_now'] ?? '') == 'true';

  String get templateBody {
    for (final component in templateComponents) {
      if (component is Map && _s(component['type']).toUpperCase() == 'BODY') {
        return _s(component['text']);
      }
    }
    return '';
  }

  String get messagePreview {
    final custom = (variables['_customMessage'] ?? '').trim();
    var text = templateBody.trim();
    if (text.isEmpty) {
      return custom.isNotEmpty
          ? custom
          : templateName == 'hello_world'
          ? 'Hello World'
          : '';
    }

    for (final entry in variables.entries) {
      if (entry.key.startsWith('_') || entry.key.startsWith('header_'))
        continue;
      final token = entry.key.startsWith('body_')
          ? entry.key.substring(5)
          : entry.key;
      text = text.replaceAll(
        RegExp('\\{\\{\\s*${RegExp.escape(token)}\\s*\\}\\}'),
        entry.value,
      );
    }
    return text;
  }
}

class DashboardData {
  DashboardData({
    required this.configured,
    required this.connectionStatus,
    required this.totalContacts,
    required this.scheduledMessages,
    required this.messagesSent,
    required this.failedMessages,
    required this.deliveredMessages,
    required this.readMessages,
    required this.approvedTemplates,
    required this.contactGroups,
    required this.upcoming,
    required this.recentMessages,
    required this.package,
  });
  final bool configured;
  final String connectionStatus;
  final int totalContacts,
      scheduledMessages,
      messagesSent,
      failedMessages,
      deliveredMessages,
      readMessages,
      approvedTemplates,
      contactGroups;
  final List<Automation> upcoming;
  final List<Map<String, dynamic>> recentMessages;
  final Map<String, dynamic> package;
  double get deliveryRate => messagesSent <= 0
      ? 0
      : (deliveredMessages / messagesSent * 100).clamp(0, 100).toDouble();
  double get readRate => deliveredMessages <= 0
      ? 0
      : (readMessages / deliveredMessages * 100).clamp(0, 100).toDouble();
  factory DashboardData.fromJson(Map<String, dynamic> j) {
    final c = (j['connection'] as Map?)?.cast<String, dynamic>() ?? {};
    final s = (j['stats'] as Map?)?.cast<String, dynamic>() ?? {};
    return DashboardData(
      configured: _b(c['configured']),
      connectionStatus: _s(c['status']),
      totalContacts: _i(s['totalContacts']),
      scheduledMessages: _i(s['scheduledMessages']),
      messagesSent: _i(s['messagesSent']),
      failedMessages: _i(s['failedMessages']),
      deliveredMessages: _i(s['deliveredMessages']),
      readMessages: _i(s['readMessages']),
      approvedTemplates: _i(s['approvedTemplates']),
      contactGroups: _i(s['contactGroups']),
      upcoming: ((j['upcoming'] as List?) ?? [])
          .whereType<Map>()
          .map((e) => Automation.fromJson(e.cast<String, dynamic>()))
          .toList(),
      recentMessages: ((j['recentMessages'] as List?) ?? [])
          .whereType<Map>()
          .map((e) => e.cast<String, dynamic>())
          .toList(),
      package:
          (j['package'] as Map?)?.cast<String, dynamic>() ??
          <String, dynamic>{},
    );
  }
}

class BirthdayItem {
  BirthdayItem({
    required this.contactId,
    required this.contactName,
    required this.contactPhone,
    required this.optIn,
    required this.dob,
    required this.ageTurning,
    required this.daysUntilBirthday,
    required this.isToday,
    required this.isThisMonth,
    required this.nextBirthdayDate,
    required this.birthdayAutomationEnabled,
    this.nextScheduledTime,
    this.automationId,
    this.automationStatus,
    this.templateId,
    this.templateName,
    this.customMessage,
  });
  final int contactId, ageTurning, daysUntilBirthday;
  final String contactName, contactPhone, dob, nextBirthdayDate;
  final bool optIn, isToday, isThisMonth, birthdayAutomationEnabled;
  final String? nextScheduledTime,
      automationStatus,
      templateName,
      customMessage;
  final int? automationId, templateId;
  factory BirthdayItem.fromJson(Map<String, dynamic> j) => BirthdayItem(
    contactId: _i(j['contactId']),
    contactName: contact_names.contactName(j['contactName']),
    contactPhone: _s(j['contactPhone']),
    optIn: _b(j['optIn']),
    dob: _s(j['dob']),
    ageTurning: _i(j['ageTurning']),
    daysUntilBirthday: _i(j['daysUntilBirthday']),
    isToday: _b(j['isToday']),
    isThisMonth: _b(j['isThisMonth']),
    nextBirthdayDate: _s(j['nextBirthdayDate']),
    birthdayAutomationEnabled: _b(j['birthdayAutomationEnabled'], true),
    nextScheduledTime: j['nextScheduledTime']?.toString(),
    automationId: j['automationId'] == null ? null : _i(j['automationId']),
    automationStatus: j['automationStatus']?.toString(),
    templateId: j['templateId'] == null ? null : _i(j['templateId']),
    templateName: j['templateName']?.toString(),
    customMessage: j['customMessage']?.toString(),
  );
}

class BirthdaySettings {
  BirthdaySettings({
    required this.enabled,
    required this.defaultSendTime,
    required this.defaultTemplateId,
    required this.customMessage,
    required this.timezone,
  });
  bool enabled;
  String defaultSendTime, customMessage, timezone;
  int defaultTemplateId;
  factory BirthdaySettings.fromJson(Map<String, dynamic> j) => BirthdaySettings(
    enabled: _b(j['enabled'], true),
    defaultSendTime: _s(j['defaultSendTime'], '09:00'),
    defaultTemplateId: _i(j['defaultTemplateId'], 1),
    customMessage: _s(j['customMessage']),
    timezone: _s(j['timezone'], 'Asia/Kolkata'),
  );
  Map<String, dynamic> toJson() => {
    'enabled': enabled,
    'defaultSendTime': defaultSendTime,
    'defaultTemplateId': defaultTemplateId,
    'customMessage': customMessage,
    'timezone': timezone,
  };
}
